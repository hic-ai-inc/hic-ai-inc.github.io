# Daily Plan — Sunday, February 22, 2026

**Author:** Kiro
**Owner:** SWR
**Context:** Phase 0.0 and Phase 0 items 0.3, 0.4, 0.7, 0.11, 0.12 are complete. All investigative work is done. The Recommendations memo is finalized and approved. Launch planning documents are updated. We are on `development` branch, clean working tree. It is ~1:30 PM EST.

**Goal:** Complete Phase 0 and begin Stream 1B SMP code integration. Maximize SWR-interactive, dashboard-heavy, and hands-on work that is difficult to do during the busy work week (Mon–Thu).

**Constraints:** SWR has a full law practice schedule Mon–Thu. Extension repo work (Stream 1A) and mechanical verification steps are deferred to early morning sessions during the week. Today's focus is Stripe, Keygen, Marketplace, and Cognito — all items requiring SWR's undivided attention and/or dashboard access.

---

## Session 1: Phase 0 Completion (~2h, 1:30–3:30 PM)

Target: Clear all remaining Phase 0 items. Achieve CP-0.

### 1. Keygen Policy Verification (0.1) — 15m

Log into Keygen dashboard. Confirm for both Individual and Business policies:

- `maxMachines` = 3 (Individual) / 5 per seat (Business)
- Overage strategy = `ALWAYS_ALLOW_OVERAGE`
- `heartbeatDuration` = 3600

If any setting is wrong, fix immediately in the dashboard.

### 2. VS Code Marketplace Publisher Verification (0.2) — 15m

- Run `vsce login hic-ai` in the Extension repo terminal
- Confirm PAT is valid and not expired
- Confirm `hic-ai.mouse` extension ID is available or already registered
- If PAT is expired, generate a new one immediately — this is on the critical path for Phase 5

### 3. Cognito Fixes (0.5 + 0.6) — 7m

Bundle these together:

- **0.5:** Open `scripts/setup-cognito.sh` in the Website repo. Change `ENVIRONMENT="staging"` to `ENVIRONMENT="${1:-staging}"`. Commit.
- **0.6:** AWS Console → Cognito → `mouse-staging-v2` → App client `mouse-staging-web` → Remove `vscode://hic-ai.mouse/callback` from callback URLs. Verify remaining URLs are correct: `http://localhost:3000/auth/callback`, Amplify feature branch URL, `https://staging.hic-ai.com/auth/callback`.

### 4. Stripe E2E Validation (0.8) — 30m

In Stripe test mode, verify all 4 checkout paths end-to-end:

1. Individual Monthly ($15/mo) → checkout → webhook → Keygen license → DynamoDB
2. Individual Annual ($150/yr) → same
3. Business Monthly ($35/seat/mo) → same
4. Business Annual ($350/seat/yr) → same

For each: confirm checkout session creates, test payment succeeds, webhook fires to staging, license provisioned in Keygen, DynamoDB record written. Document any failures.

### 5. Stripe Checkout Audit (0.9) — 30m

With AP 8 AR Phase 1.2 open as reference, audit our Checkout Session creation code against the ~16 parameters that SMP controls. Identify which parameters in our code must be removed. Document the parameter list — this feeds directly into Stream 1B step 2.3.

### 6. Comprehensive Stripe Dashboard Settings Review (0.10) — 45m

Audit all test-mode dashboard settings:

- Email receipts: verify payment receipts enabled in Stripe (not SES)
- Tax settings: ✅ tax category updated to SaaS (`txcd_10103101`) on Feb 23
- Refund policy configuration
- Decline handling settings
- Dispute settings and notification timing
- Branding: receipt logo, statement descriptor, support URL
- Promotion code configuration: document setup for future use (YouTube tutorials, seasonal discounts)
- Any other settings visible in the dashboard that affect checkout or post-purchase experience

Document findings. This is the last Phase 0 item.

### Phase 0 Checkpoint

After item 6, all Phase 0 items are complete:

- [x] 0.1 Keygen ✅
- [x] 0.2 Marketplace ✅
- [x] 0.3 Twitter/X ✅ (Feb 21)
- [x] 0.4 API_BASE_URL ✅ (Feb 22)
- [x] 0.5 Cognito script ✅
- [x] 0.6 Callback URI ✅
- [x] 0.7 DMARC ✅ (earlier)
- [x] 0.8 Stripe E2E ✅
- [x] 0.9 Stripe audit ✅
- [x] 0.10 Dashboard review ✅
- [x] 0.11 SMP validation (do after Session 1 or start of Session 2)
- [x] 0.12 SMP availability ✅ (Feb 18)

**CP-0 achieved. Phase 1 unlocked.**

---

## Break (~30m, 3:30–4:00 PM)

Step away. Phase 0 findings are fresh — let them settle before starting code changes.

---

## Session 2: Stream 1B SMP Code Integration (~2.5–3h, 4:00–7:00 PM)

Target: Complete the core SMP code changes (steps 1.1 through 2.4). Leave mechanical verification (2.5–2.10) for Monday.

### 7. SMP Integration Validation (0.11) — 30m

Synthesize findings from 0.8–0.10:

- Map verified integration against SMP requirements
- Confirm parameter change list
- Confirm DynamoDB field naming unaffected
- Identify any architectural blockers
- Produce go/no-go recommendation

This is the formal Phase 0 → Phase 1 bridge. Document as a brief findings note.

### 8. Stream 1B Steps 1.1–1.3 — 45m

- **1.1:** Baseline confirmation — reference 0.8 results (already done, just document)
- **1.2:** Forbidden parameter audit — reference 0.9 results (already done, just document)
- **1.3:** Fee assessment — document 6.5–8.4% effective rate per AP 8 AR

These three steps formalize the Phase 0 findings into Stream 1B's working context.

### 9. Stream 1B Step 2.1 — Add SMP Parameter (15m)

Add `managed_payments: { enabled: true }` to Checkout Session creation in the Website repo. Small, surgical code change.

### 10. Stream 1B Step 2.2 — Preview Version Header (15m)

Set the Stripe Preview version header. Placement per AP8-D2 (deferred to Stripe sitdown — decide now, in front of the dashboard). Global on client init is the GC recommendation.

### 11. Stream 1B Step 2.3 — Remove Forbidden Parameters (1–1.5h)

The biggest single code change today. Using the parameter list from 0.9, remove all ~16 SMP-controlled parameters from our Checkout Session creation code. Per AP8-D1 (resolved Feb 21): remove entirely, no `SMP_ENABLED` flag.

This is the core of the SMP integration. Take your time — these are payment-critical code paths.

### 12. Stream 1B Step 2.4 — Re-verify with SMP Enabled (30m)

Re-run all 4 checkout paths with SMP parameters added and forbidden parameters removed. This is the moment of truth — confirms the SMP integration works end-to-end in test mode.

If all 4 paths pass: the heavy lifting of SMP code integration is done. Steps 2.5–2.10 are verification and cleanup.

If any path fails: debug and fix before stopping. Don't leave a broken checkout overnight.

---

## End of Day

**Expected state after today:**

- Phase 0: 100% complete (CP-0 achieved)
- Stream 1B: Steps 1.1–1.3 and 2.1–2.4 complete (core SMP code changes landed)
- All Stripe dashboard settings documented
- SMP integration validated with go/no-go
- Forbidden parameters removed from checkout code
- All 4 checkout paths verified with SMP enabled

**Commit and push** all changes to `development` and `main` at end of each session.

---

## What's Next (Work Week Preview)

**Monday early AM (before phone rings):** Stream 1A — heartbeat + API_BASE_URL fixes in Extension repo (~2.5h). Fully scoped, agent-executable. Open `~/source/repos/hic` and go.

**Monday windows:** Stream 1B steps 2.5–2.10 (webhook verification, portal, email flow, test suite). Mechanical, can be done in 15–30m chunks.

**Tuesday–Wednesday:** Stream 1C email testing (7.2–7.8) in small windows. Stream 1D client verification where time allows. Begin Phase 2A (Plausible, 30m) if a window opens.

**Thursday–Friday:** Phase 2C front-end UX polish (5–6h). Phase 2E documentation drafting can begin in parallel.

**Weekend (Feb 28–Mar 1):** Phase 3A security audit + Phase 3B monitoring. The two least-defined blocks, best done with uninterrupted focus.

---

## Document History

| Date       | Author | Changes |
|------------|--------|---------|
| 2026-02-22 | Kiro   | Initial creation — Sunday afternoon/evening plan for Phase 0 completion + Stream 1B SMP code integration |
