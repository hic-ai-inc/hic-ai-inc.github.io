# Recommendation: Defer Stream 1B (SMP Code Integration) to Phase 3

**Date:** February 24, 2026
**Author:** Kiro (Claude Sonnet 4.6)
**Owner:** SWR
**Status:** APPROVED — Feb 24, 2026 (SWR)
**Purpose:** Recommend deferring all Stream 1B (SMP Code Integration) work from Phase 1 to Phase 3, folding it into an expanded Stream 3C. Documents the rationale, confirms zero impact on Phase 2, and specifies all required documentation updates.

---

## 1. Recommendation

Defer all Stream 1B work (AP 8 AR Phases 1–2, steps 1.1–1.3 and 2.1–2.10) from Phase 1 to Phase 3. Fold this work into an expanded Stream 3C, which becomes the consolidated Stripe/SMP completion stream. No other phase is affected.

---

## 2. Rationale

### 2.1 Avoiding Premature Human Review

SMP activation carries a small but non-zero risk of triggering a manual review by Stripe/Lemon Squeezy LLC. Although SMP is self-service and our account passed the automated eligibility check, the Preview Terms (§1.4) reserve Stripe's right to review accounts during the Preview period. A review triggered while the website is mid-polish, legal pages are not yet finalized, and social media presence does not yet exist would present HIC AI in the weakest possible light.

By deferring SMP activation to Phase 3, any review — if triggered — occurs after:
- The website is fully polished and credible (Phase 2C complete)
- Privacy Policy and ToS are finalized and accurate (Phase 2B complete)
- The refund policy page exists at a dedicated URL (AP1 item 1.7 complete)
- Social media presence is established (Phase 2D complete)
- Documentation is live and accurate (Phase 2E complete)

This is the strongest possible presentation to a human reviewer.

### 2.2 Consolidating All Stripe/SMP Work

Under the current plan, Stripe/SMP work is split across two phases:
- Phase 1 Stream 1B: code integration (AP 8 AR Phases 1–2)
- Phase 3 Stream 3C: dashboard finalization (AP 8 AR Phase 3)

This split creates a context-switch cost: SMP is touched in Phase 1, set aside for all of Phase 2, then picked up again in Phase 3. Consolidating everything into Phase 3 means a single focused Stripe/SMP session that takes the integration from current state (baseline verified, GO issued) all the way through to production-ready in one continuous stream.

### 2.3 No Phase 2 Dependencies on Stream 1B

A dependency analysis confirms that nothing in Phase 2 requires Stream 1B to be complete. See §3 below.

---

## 3. Dependency Analysis — Phase 2 Impact

**Verdict: Zero impact on Phase 2.**

| Phase 2 Step | Depends on Stream 1B? | Notes |
|---|---|---|
| 2A — Plausible analytics | No | Independent infrastructure |
| 2B — Privacy Policy & ToS | No | SWR attorney review; no payment code dependency |
| 2C — Front-End UX polish (AP 1) | No | Website content and styling work |
| 2D — Social media presence | No | External account creation |
| 2E — Documentation Tier 1 (AP 5) | No | Docs describe the extension and licensing flow, not SMP internals |
| 2F — Website surface security (AP 2a) | No | Reviews unauthenticated endpoints, headers, bundle — not Checkout Session code |

Stream 1C (email deliverability) is also unaffected. AP8-D4 is already resolved: Stripe/Link handles payment receipts as MoR; HIC SES handles license lifecycle emails. No SMP code changes are needed for email verification.

The only downstream dependency on Stream 1B in the entire plan is Stream 3C (SMP finalization), which already requires CP-SMP-2 as its gate. Under this proposal, that gate is simply absorbed into an expanded 3C rather than being a cross-phase dependency.

---

## 4. Proposed Restructuring

### Current Structure (Phase 1)

```
Phase 1
├── Stream 1A: Version wire-up (AP 9.8–9.10)
├── Stream 1B: SMP Code Integration (AP 8 AR Phases 1–2) ← MOVE THIS
├── Stream 1C: Email deliverability (AP 7.2–7.8)
└── Stream 1D: E2E client verification (AP 9.1–9.11)
```

### Proposed Structure

```
Phase 1
├── Stream 1A: Version wire-up (AP 9.8–9.10)
├── Stream 1C: Email deliverability (AP 7.2–7.8)
└── Stream 1D: E2E client verification (AP 9.1–9.11)

Phase 3
├── Stream 3A: Comprehensive security audit (AP 2b)
├── Stream 3B: Monitoring & observability (AP 10)
├── Stream 3C: SMP Complete — AP 8 AR Phases 1–2 + Phase 3 (EXPANDED) ← NEW
├── Stream 3D: Support infrastructure (AP 6)
└── Stream 3E: Branch protection rules
```

### Expanded Stream 3C Scope

Stream 3C becomes the complete Stripe/SMP stream, executed in sequence:

**Part 1 — Code Integration (formerly Stream 1B, AP 8 AR Phases 1–2):**
- 1.1 Verify all 4 test-mode checkout paths — baseline confirmation (30m)
- 1.2 Audit forbidden parameters against our code (30m)
- 1.3 Fee assessment confirmation (15m)
- 2.1 Add `managed_payments: { enabled: true }` to Checkout Session creation (15m)
- 2.2 Set Preview version header on Stripe client (15m)
- 2.3 Remove forbidden parameters (1–2h)
- 2.4 Re-verify all 4 checkout paths with SMP enabled (30m)
- 2.5 Verify webhook flow — 8 events (15m)
- 2.6 Verify customer portal (15m)
- 2.7 Verify email notification flow (15m)
- 2.8 Set all SMP-related Stripe code and dashboard configurations (30m)
- 2.9 Verify all Stripe configurations end-to-end (15m)
- 2.10 Run full test suite — ≥3,459 tests pass (15m)

**Part 2 — Dashboard Finalization (existing Stream 3C, AP 8 AR Phase 3):**
- 3.1 Complete SMP setup flow in Stripe Dashboard (15m)
- 3.2 2FA on Stripe account (5m)
- 3.3 Confirm tax categories — ✅ already complete (Feb 23)
- 3.4 Configure notification settings — 48-hour dispute SLA compliance (5m)

**Revised checkpoint (CP-SMP-3):** SMP parameters added, forbidden params removed, all 4 checkout paths verified E2E in test mode, webhooks confirmed, all tests pass, 2FA on Stripe, SMP setup complete, tax categories confirmed, notifications configured. → Unlocks Phase 4.

**Revised effort estimate:** ~5–7h (up from ~30 min for the original 3C alone). Stream 3C is now the largest single stream in Phase 3 but remains fully independent of 3A, 3B, 3D, and 3E.

---

## 5. Required Documentation Updates

The following documents require updates upon SWR approval of this recommendation. No updates should be made until approval is confirmed.

### 5.1 Execution Tracker (`20260218_LAUNCH_EXECUTION_TRACKER.md`) — PRIMARY

This is the most important update. Required changes:

**Phase 1 — Stream 1B section:**
- Add a prominent deferral notice at the top of the Stream 1B section
- Mark all Stream 1B items as deferred (not deleted — preserved for Phase 3 reference)
- Update the Stream 1B checkpoint (CP-SMP-2) note to indicate it is now a Phase 3 gate
- Update Phase 1 header note: "3 active streams (1A, 1C, 1D); Stream 1B deferred to Phase 3 Stream 3C"

**Phase 3 — Stream 3C section:**
- Expand Stream 3C to include all Stream 1B items (steps 1.1–1.3 and 2.1–2.10) as Part 1
- Relabel existing 3C items as Part 2
- Update the Stream 3C gate note: remove "requires CP-SMP-2" (that checkpoint is now internal to 3C)
- Update the Stream 3C checkpoint (CP-SMP-3) to encompass both parts
- Update the effort estimate (~5–7h)

**Decision Log (§3):**
- Add new row: `Feb 24 | DEFER-1B | Stream 1B (SMP Code Integration) deferred from Phase 1 to Phase 3 Stream 3C. Rationale: avoid premature SMP activation before website/legal/social are complete; consolidate all Stripe/SMP work into single Phase 3 session. Zero Phase 2 impact confirmed. | Phase 1 reduced to 3 streams (1A, 1C, 1D); Phase 3 Stream 3C expanded to absorb AP 8 AR Phases 1–2 + Phase 3. | SWR`

**Deviation Log (§4):**
- Add new row documenting the resequencing

**Cross-Reference Index (§5):**
- Update Stream 1B row: source remains AP 8 AR, but phase changes from Phase 1 to Phase 3
- Update Stream 3C row: scope expands to include AP 8 AR Phases 1–2

### 5.2 Dependency Map (`20260218_ACTION_PLAN_DEPENDENCY_MAP_V3.md`)

**Phase 1 section (§4):**
- Remove Stream 1B from the Phase 1 stream table
- Update Phase 1 summary table (remove 1B row, update total effort)
- Add a note: "Stream 1B deferred to Phase 3 Stream 3C — see §6"

**Phase 3 section (§6):**
- Expand Stream 3C description to include AP 8 AR Phases 1–2 as Part 1
- Update effort estimate for 3C (~5–7h)
- Update the gate note: Stream 3C no longer requires CP-SMP-2 as an external gate; CP-SMP-2 is now an internal milestone within 3C
- Update Phase 3 summary table (3C effort updated)

**Full Dependency Graph (§9) and Structural Overview (§2):**
- Update the Phase 1 line: `AP 9 | AP 7` (remove `AP 8 Phases 1–2`)
- Update the Phase 3 line: `AP 2b | AP 10 | AP 8 Phases 1–3 | AP 6` (was `AP 8 Phase 3`)

### 5.3 AP 8 AR (`20260218_AP8_MOR_STRATEGY_AND_PAYMENT_INTEGRATION_AR.md`)

**Phase 1 Exit Criteria (§4):**
- Add a note that steps 1.1–1.3 are now executed in Phase 3 Stream 3C, not Phase 1

**Phase 2 header (§5):**
- Add a note that this phase is now executed in Phase 3 Stream 3C

**Effort & Timeline Summary (§12):**
- Update to reflect that Phases 1–2 execute in Phase 3 of the launch plan (not Phase 1)

**Document History (§15):**
- Add entry: Feb 24 — AP 8 AR Phases 1–2 resequenced to Phase 3 Stream 3C per deferral recommendation memo

### 5.4 Pre-Launch Assessment V3 (`20260218_PRE_LAUNCH_STATUS_ASSESSMENT_AND_ACTION_PLANS_V3.md`)

**Line 434 reference** ("The single most time-sensitive action is completing the SMP code integration..."):
- Update to reflect that SMP code integration is now Phase 3 work, not the most time-sensitive Phase 1 item
- The most time-sensitive Phase 1 items are now 1A (version wire-up) and 1D (E2E client verification)

### 5.5 Documents Requiring No Changes

The following documents are unaffected by this deferral:

| Document | Reason |
|---|---|
| AP 0 V2 | Phase 0 work complete; no Stream 1B references |
| AP 1 V2 | Front-end work; no payment code dependency |
| AP 4 V2 | Production deployment; depends on Phase 3 completion, not Stream 1B specifically |
| AP 5 V2 | Documentation; no SMP code dependency |
| AP 12 V2 | Social media; no payment dependency |
| Stripe Dashboard Recommendations memo | Dashboard configuration; unaffected by code deferral |
| SMP Discovery Memo | Analysis document; no sequencing content |
| Open Decisions Register | No open decisions are affected; DEFER-1B is a new resolved decision |

---

## 6. Impact on Phase 1 Checkpoint

Phase 1 currently has no single unified checkpoint — each stream has its own (CP-9, CP-SMP-2, CP-13, CP-E2E). With Stream 1B removed, Phase 1 completes when CP-9 + CP-13 + CP-E2E are all satisfied. CP-SMP-2 moves to Phase 3 as an internal milestone within Stream 3C.

The Phase 1 → Phase 2 gate is unaffected: Phase 2 requires features finalized (CP-9), email working (CP-13), and clients verified (CP-E2E). None of these depend on SMP code.

---

## 7. Impact on Timeline

| | Current Plan | Proposed Plan |
|---|---|---|
| Phase 1 effort | ~12–16h (4 streams) | ~8–12h (3 streams) |
| Phase 3 effort | ~16–21h (5 streams) | ~21–28h (5 streams, 3C expanded) |
| Total effort | Unchanged | Unchanged |
| Phase 1 elapsed | ~2–3 days | ~2 days (slightly faster) |
| Phase 3 elapsed | ~2 days | ~2–2.5 days (3C is now the longest stream) |
| Net timeline impact | — | Neutral to slightly positive (Phase 1 faster; Phase 3 slightly longer but streams still parallel) |

---

## 8. Approval

Upon SWR approval of this memo, proceed with documentation updates in the following order:
1. Execution Tracker (primary — single source of truth)
2. Dependency Map (structural reference)
3. AP 8 AR (source document for the moved work)
4. Assessment V3 (minor update, one reference)

---

## Document History

| Date | Author | Changes |
|---|---|---|
| 2026-02-24 | Kiro (Sonnet 4.6) | Initial draft |
