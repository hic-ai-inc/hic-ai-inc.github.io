# Technical Debt Log

**Purpose:** Consolidated list of known non-launch-blocking technical debt and UX quality gaps to address post-launch.

**Status key:**

- Deferred (post-launch): intentionally postponed to protect launch trajectory
- Planned: accepted and scoped for next implementation window
- Closed: completed and verified

## Deferred (Post-Launch)

### TD-A3 — Portal routing for `past_due` / `suspended` users

- Source: `docs/plg/20260228_STREAM_1D_COMPLETION_PLAN.md` (Addendum A.3)
- Problem: users in payment-issue states are routed to new-user activation UX instead of payment-recovery guidance.
- Impact: misleading UX, potential unnecessary repurchase attempts.
- Launch impact: **Not launch-blocking**.
- Target timing: ASAP post-launch (first UX hardening batch).
- Candidate files:
  - `plg-website/src/app/api/portal/status/route.js`
  - `plg-website/src/app/portal/page.js`

### TD-A4 — Portal framing for `expired` users

- Source: `docs/plg/20260228_STREAM_1D_COMPLETION_PLAN.md` (Addendum A.4)
- Problem: expired returning users are treated as brand-new users with generic activation framing.
- Impact: lower-quality UX and weaker returning-customer messaging.
- Launch impact: **Not launch-blocking**.
- Target timing: post-launch UX polish batch.
- Candidate files:
  - `plg-website/src/app/api/portal/status/route.js`
  - `plg-website/src/app/portal/page.js`

### TD-A5 — Suspended/revoked Business members shown checkout CTA

- Source: `docs/plg/20260228_STREAM_1D_COMPLETION_PLAN.md` (Addendum A.5)
- Problem: suspended/revoked org members can appear as new users and be prompted to purchase.
- Impact: confusing member experience and support risk as Business usage scales.
- Launch impact: **Not Day-1 launch-blocking**, but should be fixed before meaningful Business team-management scale-up.
- Target timing: urgent post-launch (early Business UX hardening).
- Candidate files:
  - `plg-website/src/lib/dynamodb.js`
  - `plg-website/src/app/api/portal/status/route.js`
  - `plg-website/src/app/portal/page.js`

### TD-A6 — Duplicate `CANCELLATION_REQUESTED` email on Stripe dual-event

- Source: `docs/plg/20260228_STREAM_1D_COMPLETION_PLAN.md` (Addendum A.6)
- Problem: cancellation action can emit duplicate transactional emails.
- Impact: user-facing quality bug (not data-corrupting).
- Launch impact: **Not hard launch-blocking**.
- Target timing: post-launch urgent bugfix unless very low-effort pre-launch patch is chosen.
- Preferred fix direction:
  - subscription-state idempotency check in webhook handler (`Option A` from Addendum A.6)
- Candidate files:
  - `plg-website/src/app/api/webhooks/stripe/route.js`

## Notes

- A.7 and A.8 are resolved and intentionally excluded from deferred debt.
- This log is intentionally timing-agnostic for launch gating, while still preserving urgency guidance for post-launch cleanup.
