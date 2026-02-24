# AP 0: Quick Wins & Initial Setup

**Date:** February 17, 2026
**Author:** GC (GitHub Copilot)
**Status:** DRAFT — awaiting SWR review
**Purpose:** Consolidates all fast, zero-dependency tasks that must be completed before the main action plan tracks begin. This is the opening gate before Track A (website + MoR application) and Track B (extension + audit) work starts in earnest.

---

## Admission Criteria

Every item in Phase 0 must satisfy at least one of these two conditions:

1. **It must come first.** Downstream dependency chains in other action plans cannot begin until this item is resolved. Deferring it to its natural AP would delay the critical path.
2. **It is fast and clears the decks.** Under ~30 minutes, removes an unknown or risk that would otherwise interrupt flow during the main sprint.

Items that have no dependencies but are substantial (>30 min of focused work) or that don't unblock downstream chains belong in their natural action plan, not here. **Every minute spent on Phase 0 is a minute delayed before emailing Lemon Squeezy.**

---

## Items

### Group A: Research & Verification

These are non-destructive checks that retire risk or unlock planning for other action plans. All are independent — can be done in any order or in parallel.

---

#### 0.1 — Keygen Policy Verification

**Action:** Log into Keygen dashboard (or query the API) and confirm the following policy settings match what Phase 0 (Feb 11) was supposed to apply:

| Setting                               | Expected Value         |
| ------------------------------------- | ---------------------- |
| Individual policy `maxMachines`       | `3`                    |
| Individual policy overage strategy    | `ALWAYS_ALLOW_OVERAGE` |
| Individual policy `heartbeatDuration` | `3600` (seconds)       |
| Business policy — same checks         | Corresponding values   |

**Effort:** 15 minutes

**Why Phase 0:** The entire device management stack (Phase 5, fully complete, 37+ tests) assumes these values. If the Individual policy still has `maxMachines=2` and `NO_OVERAGE`, the 3rd device activation will fail silently with a confusing Keygen error instead of being handled by the DynamoDB enforcement layer. This is a foundational assumption that must be verified before any E2E testing (AP 9) or production deployment (AP 4) proceeds. 15 minutes now prevents a bewildering debugging session later.

**Exit criterion:** All policy settings confirmed to match expected values. If any are wrong, fix immediately (Keygen dashboard, <5 min).

---

#### 0.2 — VS Code Marketplace Publisher Verification

**Action:** Run `vsce login hic-ai` and confirm the Personal Access Token is configured and the publisher ID `hic-ai` is valid. Verify that the `hic-ai.mouse` extension ID is available or already registered.

**Effort:** 15 minutes

**Why Phase 0:** Marketplace publishing (24–48 hour review) is a hard external wait on the critical path. If the publisher account doesn't work — expired PAT, wrong publisher ID, name conflict — the issue takes days to resolve through Microsoft support. Discovering this on Day 12 pushes launch by 2–4 days with zero ability to compress. 15 minutes of verification now de-risks the entire launch timeline.

**Exit criterion:** `vsce login hic-ai` succeeds. Publisher account confirmed active. Extension ID confirmed available.

---

#### 0.3 — Twitter/X Business Account Research

**Action:** Research whether a HIC AI, Inc. business/professional Twitter/X account can be created without:

- Requiring a personal account first
- Publicly announcing that SWR has created a new personal account (which would be discoverable before private disclosures in AP 13)

Document findings: what's required, what's visible publicly, and any timing constraints.

**Effort:** 15–30 minutes

**Why Phase 0:** AP 12 (Social Media Plan) cannot be fully planned without this answer. The LS/Paddle MoR applications require a social media presence (LS previously rejected citing its absence). If creating a business Twitter account requires a personal account, that creates a disclosure timing constraint that the Social Media plan must account for. This is a research question that takes minutes to answer and unblocks the planning of two other action plans.

**Exit criterion:** Clear answer documented: can/cannot create business account independently, what's publicly visible, recommended approach for AP 12.

---

#### 0.4 — Investigate Production `API_BASE_URL` Mechanism

**Action:** Time-boxed investigation (30 min cap) into how `licensing/constants.js` `API_BASE_URL` is changed from `https://staging.hic-ai.com` to `https://hic-ai.com` for the production VSIX. Examine:

- `release-mouse.sh` build pipeline for environment injection points
- Whether `esbuild` configuration supports define/replace at build time
- Whether the constant is baked into the VSIX at build time or configurable post-build
- What the simplest mechanism is to produce a staging VSIX vs. production VSIX from the same source

**Effort:** 30 minutes (hard cap — produce findings memo, not a solution)

**Why Phase 0:** The production VSIX cannot be built until this is understood. The answer may be trivial (edit the constant, build, tag, revert) or may require build infrastructure changes. Either way, discovering the answer now means AP 4 (production deployment) and AP 9 (version update wire-up) can be planned with full knowledge of the build mechanism. Late discovery risks architectural surprise during the final sprint.

**Exit criterion:** Mechanism documented. If trivial: note the steps. If non-trivial: flag for Track B implementation with estimated effort.

---

### Group B: Quick Fixes

Small code or configuration changes that prevent downstream problems. Each under 10 minutes.

---

#### 0.5 — Fix `setup-cognito.sh` ENVIRONMENT Hardcoding

**Action:** Update `scripts/setup-cognito.sh` to accept the environment as a CLI parameter instead of hardcoding `ENVIRONMENT="staging"`:

```bash
ENVIRONMENT="${1:-staging}"
```

**Effort:** 5 minutes

**Why Phase 0:** AP 4 Phase P1 runs this script to create the production Cognito user pool. Running it as-is creates a pool named `mouse-staging-*` in production — a high-consequence mistake during a high-pressure sprint. Fix is one line and eliminates a category of error at a critical moment.

**Exit criterion:** Script accepts environment parameter. Running `./setup-cognito.sh production` would create `mouse-plg-production` (or equivalent) resources. Staging behavior unchanged when called without arguments.

---

#### 0.6 — Remove Orphaned `vscode://` Callback URI from Staging Cognito

**Action:** Remove `vscode://hic-ai.mouse/callback` from the staging Cognito user pool client's callback URL list (`mouse-staging-v2`, client `mouse-staging-web`).

**Effort:** 2 minutes (AWS Console or CLI)

**Why Phase 0:** Bundled housekeeping while we're already touching Cognito configuration for item 0.5. The URI is vestigial from Phase 1 auth implementation (replaced by browser-based JWT auth). It's harmless but confusing — anyone reviewing the Cognito configuration will wonder what it does, and it could mislead future configuration decisions. Two minutes to remove it while the context is fresh.

**Exit criterion:** Callback URL list for staging client contains only `http://localhost:3000/auth/callback`, the Amplify feature branch URL, and `https://staging.hic-ai.com/auth/callback`.

---

### Group C: Infrastructure & DNS

Items where lead time matters — doing them now lets propagation or setup happen passively while other work proceeds.

---

#### 0.7 — DMARC Record

**Action:** Add a DNS TXT record in GoDaddy:

```
_dmarc.hic-ai.com  TXT  "v=DMARC1; p=none; rua=mailto:dmarc@hic-ai.com; fo=1"
```

Starting with `p=none` (monitor-only) is appropriate pre-launch. Can tighten to `p=quarantine` or `p=reject` post-launch once DMARC reports confirm no legitimate senders are affected.

**Effort:** 5 minutes active + up to 48 hours passive DNS propagation (typically <1 hour)

**Why Phase 0:** DNS propagation takes time. Every subsequent email deliverability test (AP 7.2–7.6) and MoR application (AP 8) benefits from DMARC being in place and propagated. Doing it now means by the time we get to email testing, DMARC is already live. Also strengthens the MoR application — LS/Paddle reviewers may check email infrastructure professionalism. Five minutes of work with a passive propagation tail that runs in the background.

**Exit criterion:** `dig TXT _dmarc.hic-ai.com` returns valid DMARC record. (May need to verify after propagation.)

---

#### 0.8 — Branch Protection Rules

**Action:** Configure branch protection on both repos (`hic-ai-inc/hic-ai-inc.github.io` and `hic-ai-inc/hic`):

- `development` branch: require PR for merges, no direct pushes
- `main` branch: require PR for merges, no direct pushes

**Effort:** ~15 minutes (GitHub UI, both repos)

**Why Phase 0:** The pre-launch sprint is the highest-velocity period this codebase will experience. An accidental `git push origin main` during a context switch between Track A and Track B work bypasses all CI checks and can introduce regressions at the worst possible moment. Fifteen minutes of configuration now provides a safety net for the entire sprint. This is the repo equivalent of putting on a seatbelt before driving fast.

**Exit criterion:** Direct pushes to `development` and `main` are rejected on both repos. PR workflow confirmed functional.

---

### Group D: Baseline Verification & MoR Preparation

These items must complete before the MoR application emails (LS + Paddle) can be sent with confidence. They have a strict internal dependency chain: 0.9 feeds into 0.10.

---

#### 0.9 — Stripe E2E Validation (4 Checkout Paths)

**Action:** In Stripe test mode, verify all 4 checkout paths end-to-end:

1. Individual Monthly → checkout → webhook → Keygen license created → DynamoDB record
2. Individual Annual → same
3. Business Monthly → same
4. Business Annual → same

For each path, confirm: Stripe checkout session creates, payment succeeds in test mode, webhook fires to staging endpoint, license is provisioned in Keygen, DynamoDB record written correctly.

**Effort:** 30 minutes

**Why Phase 0:** The MoR feasibility assessment (0.10) must map _verified_ Stripe integration state against LS/Paddle equivalents. If any of the 4 checkout paths are broken, the feasibility assessment would be based on assumptions instead of facts. This is the ground truth that the assessment depends on.

**Exit criterion:** All 4 checkout paths verified end-to-end in test mode. Any failures documented with root cause.

---

#### 0.10 — MoR Feasibility Assessment (LS + Paddle)

**Depends on:** 0.9 (Stripe E2E results as input)

**Action:** Structured assessment (~45–60 min) that:

1. Maps the verified Stripe integration (from 0.9) against LS equivalents — products, checkout, webhooks, customer portal, subscription management
2. Maps the same against Paddle equivalents (brief — Paddle's API surface is well-documented)
3. Surfaces the DynamoDB field naming question: rename `stripeCustomerId`/`stripeSubscriptionId` fields, or abstract behind provider-agnostic names?
4. Identifies any architectural blockers to either migration
5. Produces a go/no-go recommendation for each platform
6. Briefly assesses the Stripe emergency fallback: what does "launch with Stripe as processor" mean for global tax compliance? Which jurisdictions require immediate attention? What's the exposure timeline?

This assessment uses the existing `20260216_PROPOSED_PLANS_FOR_LEMON_SQUEEZY_MIGRATION.md` as a starting point and extends it to cover Paddle and the Stripe fallback scenario.

**Effort:** 45–60 minutes

**Why Phase 0:** Cannot email LS or Paddle without confidence that migration is technically feasible. The feasibility assessment is the difference between "we're applying and hoping it works" and "we're applying and we know the integration path." It also surfaces the Stripe fallback exposure so that decision isn't made under pressure if both MoR applications are rejected.

**Exit criterion:** Written assessment with go/no-go for LS, go/no-go for Paddle, DynamoDB naming recommendation, and Stripe fallback exposure summary. Sufficient to inform AP 8 (MoR Strategy) planning and to proceed with MoR application emails.

---

#### 0.11 — Check Stripe Dashboard for Managed Payments Availability

**Status:** ✅ COMPLETED (Feb 18, 2026)

**Action:** Navigate to Stripe Dashboard → Settings → Managed Payments. Determine whether Stripe Managed Payments (Stripe's global MoR service, operated by Lemon Squeezy LLC) is available on our existing Stripe account.

**Result:** **Available and active.** Stripe Managed Payments is live on our account. Stripe picked up our existing products and tax category (originally downloadable software, business use; updated to SaaS `txcd_10103101` on Feb 23). The integration path requires adding `managed_payments[enabled]=true` to Checkout Session creation, a preview version header, and removing ~16 parameters that Stripe/Link controls when acting as MoR. No separate application or KYB process was required — our existing Stripe verification was sufficient.

**Effort:** 2 minutes (actual)

**Why Phase 0:** This single check potentially eliminates the need for a separate MoR application to LS or Paddle, collapses the ~1 week MoR wait window, and reduces the payment integration effort from 8–14 hours (migration) to 2–4 hours (parameter changes). The downstream impact on AP 8, the Dependency Map, and the Launch Plan is significant. See `20260218_STRIPE_MANAGED_PAYMENTS_DISCOVERY.md` for full analysis.

**Exit criterion:** ✅ Managed Payments available in Dashboard. Preview terms identified for attorney review (AP 11 / Step A2). Progress saved at Step 3 of Stripe's setup flow.

## Phase 0 Summary

| #    | Item                                    | Effort    | Category       | Depends On |
| ---- | --------------------------------------- | --------- | -------------- | ---------- |
| 0.1  | Keygen policy verification              | 15 min    | Verification   | —          |
| 0.2  | Marketplace publisher verification      | 15 min    | Verification   | —          |
| 0.3  | Twitter/X business account research     | 15–30 min | Research       | —          |
| 0.4  | Production `API_BASE_URL` investigation | 30 min    | Research       | —          |
| 0.5  | Fix `setup-cognito.sh` hardcoding       | 5 min     | Quick fix      | —          |
| 0.6  | Remove orphaned callback URI            | 2 min     | Quick fix      | —          |
| 0.7  | DMARC record                            | 5 min     | DNS            | —          |
| 0.8  | Branch protection rules                 | 15 min    | Infrastructure | —          |
| 0.9  | Stripe E2E validation                   | 30 min    | Verification   | —          |
| 0.10 | MoR feasibility assessment              | 45–60 min | Planning       | 0.9        |
| 0.11 | Stripe Managed Payments check           | 2 min     | Verification   | —          |

**Total estimated effort:** ~3–3.5 hours (0.11 already completed)

**Internal sequencing:** Items 0.1–0.9 and 0.11 have no dependencies on each other and can be done in any order. Item 0.10 depends on 0.9. Item 0.11 is already complete (Feb 18). Items 0.5 and 0.6 are natural companions (both touch Cognito config). Items 0.7 benefits from being done early (propagation lead time).

**Suggested execution order for a single session:**

1. 0.7 (DMARC) — do first, let DNS propagate while working on everything else
2. 0.1 (Keygen) + 0.2 (Marketplace) + 0.3 (Twitter research) — quick verifications, parallel-safe
3. 0.5 + 0.6 (Cognito fixes) — bundled, 7 minutes total
4. 0.8 (Branch protection) — protective infrastructure
5. 0.4 (API_BASE_URL investigation) — longer research, benefits from uninterrupted focus
6. 0.9 (Stripe E2E) — hands-on testing
7. 0.10 (MoR feasibility) — synthesis, depends on 0.9, natural conclusion

---

## Items Explicitly Excluded from Phase 0

The following items were considered for Phase 0 but don't meet the admission criteria. They belong in their natural action plan sequence.

| Item                                           | Why Excluded                                                                                                                           | Where It Belongs                                                                |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **2FA hardening** (GitHub, Stripe, Keygen)     | Important but doesn't unblock any downstream chain. Each takes 5 min but collectively adds up, and the sprint won't fail without them. | AP 2b (Comprehensive Security Audit) — same security mindset, natural companion |
| **AWS Budget alerts**                          | Post-launch operational concern. No pre-launch urgency.                                                                                | AP 10 (Monitoring) or post-launch backlog                                       |
| **Lambda concurrency review**                  | Post-launch scaling concern.                                                                                                           | AP 10 or post-launch backlog                                                    |
| **VSIX distribution cleanup** (GAP-9)          | Depends on version wire-up (AP 9.8–9.10) completing first. Natural Track B sequencing.                                                 | AP 9 / Track B, after version wire-up                                           |
| **FAQ pricing fix**                            | Fast (15 min) but doesn't unblock anything outside AP 1. Naturally the first item in AP 1's execution order.                           | AP 1 (Front-End UX), item 1.1                                                   |
| **Dead doc links / search bar removal**        | AP 1 and AP 5 pre-conditions. Natural first steps in those APs, not Phase 0.                                                           | AP 1 §1.5–1.6 / AP 5 Phase 1                                                    |
| **Delete Facebook** (AP 12a)                   | Zero urgency, zero downstream dependencies. Personal housekeeping.                                                                     | AP 12 (Social Media Plan)                                                       |
| **Plausible analytics wire-up**                | Substantial implementation work (~30 min+), not a quick win. Properly the first step of Track A.                                       | Track A Step A1 / AP 11.4                                                       |
| **Naming convention standardization** (AP4 P0) | 1–2 hours of code changes across 9 CF templates. Substantial, and only needed before production deployment — which is far downstream.  | AP 4 internal Phase P0                                                          |
| **Copyright / provisional patent filing**      | SWR personal legal tasks. No technical dependencies. Best done during LS wait window when SWR has certainty of launch.                 | AP 11 (Legal), LS wait window                                                   |
| **IP review of public docs**                   | Requires docs to be finalized first (AP 5). Naturally sequenced after documentation work.                                              | AP 11 (Legal), after AP 5                                                       |

---

## Phase 0 Exit Gate

Phase 0 is complete when all 11 items are resolved and the following are true:

- [ ] Keygen policies confirmed correct (or fixed)
- [ ] Marketplace publisher account confirmed functional
- [ ] Twitter/X business account creation path documented
- [ ] Production `API_BASE_URL` mechanism understood and documented
- [ ] `setup-cognito.sh` accepts environment parameter
- [ ] Orphaned callback URI removed from staging Cognito
- [ ] DMARC record live and propagating
- [ ] Branch protection active on both repos
- [ ] All 4 Stripe checkout paths verified end-to-end
- [ ] MoR feasibility assessment complete with go/no-go for LS, Paddle, and Stripe fallback exposure documented
- [x] Stripe Managed Payments availability confirmed (Feb 18 — available, no separate application needed)

**After Phase 0:** Track A (website + MoR application) and Track B (extension + audit) can begin. The discovery that Stripe Managed Payments is available on our account (item 0.11) significantly impacts AP 8 and may eliminate the need for separate LS/Paddle applications. See `20260218_STRIPE_MANAGED_PAYMENTS_DISCOVERY.md` for full impact analysis.

---

## Document History

| Date       | Author | Changes                                                          |
| ---------- | ------ | ---------------------------------------------------------------- |
| 2026-02-17 | GC     | Initial document — curated Phase 0 items with admission criteria |
| 2026-02-18 | GC     | Added item 0.11: Stripe Managed Payments dashboard check (completed — available on our account). Updated summary, exit gate, and document history. |
