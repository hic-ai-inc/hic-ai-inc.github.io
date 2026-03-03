# Billing Portal Remediation Plan

**Date:** 2026-03-03
**Author:** Kiro (supervised by SWR)
**Branch:** `development` (HEAD: `5ba6c9d`)
**Status:** Pending review

## Background

The Stripe Portal flow_data spec (`.kiro/specs/stripe-portal-flow-data-implementation/`) was implemented across commits `8eb4603` → `0b26493` → `5ba6c9d`. E2E testing revealed that the spec's frontend UX is fundamentally broken — flow_data deep links create isolated Stripe experiences with no cancellation option and no way to navigate to the main Stripe Customer Portal.

However, the dual portal **configurations** work perfectly when accessed through the main portal. The tier-specific `configuration` parameter (`STRIPE_PORTAL_CONFIG_INDIVIDUAL` / `STRIPE_PORTAL_CONFIG_BUSINESS`) correctly restricts what each tier can do inside the Stripe Customer Portal.

## Goal

Revert all frontend/UX changes to pre-spec appearance while preserving the two backend wins:
1. **Tier-specific portal configurations** — the `configuration` parameter in `billingPortal.sessions.create()`
2. **Basil+ fix** — reading `current_period_start/end` from subscription item level

## Investigation Findings (Git + Spec Review)

### 1) Last Known Good Boundary

- **Last commit before cutoff (Mar 2, 2026 11:59pm EST):** `1dd0947` (2026-03-02 22:46:22 -0500)
- **Post-cutoff commits affecting billing/portal flow:**
  - `0b26493` (2026-03-03 07:46:55 -0500) — flow_data implementation + billing page rewrite
  - `5ba6c9d` (2026-03-03 08:30:23 -0500) — Stripe Basil compatibility fix (period dates moved to subscription item)

### 2) What Changed Since Last Known Good

#### Frontend UX changes (primary regression source)

- `plg-website/src/app/portal/billing/page.js`
  - Replaced single generic portal entry behavior with action-specific deep-flow buttons.
  - Added seat management UI block and inline invoice table.
  - Removed prior behavior where all billing actions opened the main Stripe Customer Portal.

#### Backend/session behavior changes (deep-flow enforcement)

- `plg-website/src/app/api/portal/stripe-session/route.js`
  - Added required `flow` request body validation.
  - Rejects missing/invalid flow with 400.
  - Always sets `flow_data` (no generic portal session path).
  - Added guard rails for cycle switch/seat adjustment/cancel.
  - **Retains tier-specific portal configuration selection** (`STRIPE_PORTAL_CONFIG_INDIVIDUAL` / `..._BUSINESS`).

- `plg-website/src/lib/stripe.js`
  - Removed dead `createPortalSession()` helper.

- `plg-website/src/app/api/portal/invoices/route.js`
  - New API used by inline invoice table UX.

#### Backend fixes that are independent and should be preserved

- `plg-website/src/app/api/portal/billing/route.js`
- `plg-website/src/app/api/portal/settings/delete-account/route.js`
- `plg-website/src/app/api/portal/settings/export/route.js`
- `plg-website/__tests__/fixtures/subscriptions.js`

These files implement Stripe API `2025-03-31.basil` compatibility by reading billing period timestamps from `subscription.items.data[0]` instead of root subscription fields.

### 3) Spec Artifact Review

Reviewed: `.kiro/specs/stripe-portal-flow-data-implementation/bugfix.md`, `design.md`, `tasks.md`.

- Spec intent correctly enforced cross-tier prevention via deep links.
- Practical E2E outcome (per SWR validation) is unacceptable UX due to isolated Stripe deep-flow pages and no easy return to main portal until flow completion.
- There is no app-local standalone deep-flow page to remove; the problematic confirmation/cancel pages are Stripe-hosted when `flow_data` is used.

### 4) Root Cause of Current UX Failure

The current frontend+API combination forces users into Stripe `flow_data`-scoped pages and blocks generic portal access:

1. Billing UI now calls `POST /api/portal/stripe-session` with specific `flow` values.
2. API refuses requests without `flow`.
3. API always passes `flow_data` to Stripe.
4. Stripe opens deep-flow confirmation pages instead of full portal landing page.


## Surgical Restoration Plan (Minimal, Preserve Backend Wins)

### Design Principle

- Restore **pre-spec billing page UX** from `1dd0947`.
- Preserve **tier-specific portal configuration routing** in backend.
- Preserve **Basil item-level period field fixes** from `5ba6c9d`.
- Keep deep-flow code present if desired, but make it non-default/dead path.

### Proposed Change Set

#### A) Restore billing page UX to pre-spec look/behavior

Target file:
- `plg-website/src/app/portal/billing/page.js`

Action:
- Revert this file to `1dd0947` baseline UX behavior:
  - single `handleManageSubscription()` behavior
  - all action buttons route to main portal session
  - remove seat input panel
  - remove inline invoice table
  - restore prior card/button text and layout

Rationale:
- This is the main visual/interaction regression and can be surgically reverted in one file.

#### B) Re-enable generic main-portal session path while preserving dual config logic

Target file:
- `plg-website/src/app/api/portal/stripe-session/route.js`

Action (minimal, explicit):
- Keep current auth/customer lookup/tier-config selection logic intact.
- Preserve dual portal configuration behavior (`STRIPE_PORTAL_CONFIG_INDIVIDUAL` / `STRIPE_PORTAL_CONFIG_BUSINESS`) as mandatory routing.
- Remove any fallback to Stripe default configuration for this endpoint: if the required tier config is missing for the user account type, fail fast with 5xx.
- Restore generic main-portal session behavior for current billing UI calls, but only via an explicit, validated request mode (no implicit empty-body fallback).
- Keep deep-flow builders and related validation code in an optional path for now; do not classify all validation as dead until post-restore usage audit.

Implementation approach (single option):
1. **Explicit dual-mode contract in same endpoint**
   - Require request body with explicit mode/action selector.
   - `mode: "main_portal"` => create generic main portal session (no `flow_data`).
   - `mode: "deep_flow"` + valid flow payload => execute existing deep-flow path.
   - Missing/invalid mode or incomplete payload => return 4xx (contract violation).
   - Missing required tier-specific portal config secret for resolved account type => return 5xx (server misconfiguration).

Recommended: enforce this explicit contract now so restoration is safe and deterministic while preserving all existing dual-config wiring.

#### C) Keep Basil compatibility fixes untouched

Files to preserve as-is:
- `plg-website/src/app/api/portal/billing/route.js`
- `plg-website/src/app/api/portal/settings/delete-account/route.js`
- `plg-website/src/app/api/portal/settings/export/route.js`
- `plg-website/__tests__/fixtures/subscriptions.js`

Rationale:
- Independent production correctness fix; not tied to UX regression.

#### D) Leave non-triggered deep-flow/invoice code in place unless cleanup requested

Can remain untouched now (candidate dead/unused inventory for later removal):

1. **Deep-flow frontend wiring in billing page**
   - `plg-website/src/app/portal/billing/page.js`
   - Candidate snippet group (post-restore expected unused/removed):
     - `seatCount` state + seat input UI block
     - `invoices` state + `fetchInvoices()`
     - `handlePortalAction(flow, options)` dispatcher
     - flow-specific button actions (`switch_to_annual`, `switch_to_monthly`, `adjust_seats`, `update_payment`, `cancel`)
     - inline invoice table rendering + `InvoiceStatusBadge`

2. **Deep-flow backend route logic**
   - `plg-website/src/app/api/portal/stripe-session/route.js`
   - Candidate snippet group (expected dormant after restore):
     - `VALID_FLOWS`, `SUBSCRIPTION_FLOWS`
     - `buildCycleSwitchFlowData()`, `buildSeatAdjustFlowData()`, `buildCancelFlowData()`
     - deep-flow request parsing/validation branches
     - `flow_data` assignment path in `sessionParams`

3. **Invoices API introduced for inline table UX**
   - `plg-website/src/app/api/portal/invoices/route.js`
   - Likely unused once billing page returns to portal-based invoice access.

4. **Deep-flow-focused tests**
   - `plg-website/__tests__/unit/api/portal.test.js` (flow_data test blocks)
   - `plg-website/__tests__/unit/lib/index.test.js` (if asserting flow-specific billing UX/API contracts)

Important note on validation code:
- Validation inside `stripe-session/route.js` should be split into:
  - **Mode/contract validation that remains active** (must stay enforced).
  - **Deep-flow-specific validation** that may become dormant only if deep-flow mode is not invoked.
- Therefore, validation should not be blanket-labeled dead until we run a post-restore call-path audit.

Rationale:
- User preference is restoration now, cleanup later with an explicit dead-code removal pass.


## File Classification Matrix (Restore vs Preserve)

### Restore to pre-spec behavior
- `plg-website/src/app/portal/billing/page.js`

### Preserve current backend fixes
- `plg-website/src/app/api/portal/billing/route.js`
- `plg-website/src/app/api/portal/settings/delete-account/route.js`
- `plg-website/src/app/api/portal/settings/export/route.js`

### Preserve dual-config wiring; adjust default behavior
- `plg-website/src/app/api/portal/stripe-session/route.js`

### Keep as optional/dormant path for now (post-restore audit target)
- `plg-website/src/app/api/portal/invoices/route.js`
- deep-flow branches/helpers inside `plg-website/src/app/api/portal/stripe-session/route.js`
- deep-flow-specific UI/API tests in `plg-website/__tests__/unit/api/portal.test.js` and `plg-website/__tests__/unit/lib/index.test.js`

### Test files expected to need alignment after restore
- `plg-website/__tests__/unit/api/portal.test.js`
- Possibly `plg-website/__tests__/unit/lib/stripe.test.js` (only if route contract assumptions changed)


## Execution Sequence (When Approved)

1. Capture safety checkpoint (`git diff`, targeted file backups).

2. Restore baseline billing UX file from pre-cutoff commit into current working tree:

```bash
git restore --source 1dd0947 -- plg-website/src/app/portal/billing/page.js
```

3. Stage only that baseline UX retrieval (for clear diff isolation before route patch):

```bash
git add plg-website/src/app/portal/billing/page.js
git diff --cached -- plg-website/src/app/portal/billing/page.js
```

4. Patch `stripe-session/route.js` for explicit dual-mode contract:
   - require explicit request mode (`main_portal` or `deep_flow`),
   - return 4xx on missing/invalid mode/payload,
   - return 5xx on missing required tier config for resolved account type,
   - preserve deep-flow builders/logic behind `deep_flow` mode.

5. Stage route changes and review exact intended delta:

```bash
git add plg-website/src/app/api/portal/stripe-session/route.js
git diff --cached -- plg-website/src/app/api/portal/stripe-session/route.js
```

6. Run focused tests for portal API + billing page contract.

7. Run broader PLG test suite if focused tests pass.

8. Deliver verification notes with exact files changed and behavior checklist.

### Optional one-shot retrieval command (if we later decide to restore additional files from 1dd0947)

```bash
git restore --source 1dd0947 -- \
  plg-website/src/app/portal/billing/page.js
```

Note:
- The command above updates the named file(s) in the current branch to match commit `1dd0947` without moving HEAD or touching unrelated files.


## Validation Checklist (Must Pass)

- Billing page visually matches pre-spec layout and controls.
- Clicking any billing action opens **main Stripe Customer Portal**, not forced deep-flow confirmation.
- Individual account in Stripe portal cannot purchase Business tier.
- Business account in Stripe portal cannot purchase Individual tier.
- Individual remains fixed at quantity = 1.
- Business seat controls/limits follow Stripe portal config (1–99; contact sales >99).
- Update payment details/customer info remains available to authorized users.
- Basil-derived period dates continue to render without runtime errors.


## Notes

- No application code changes were performed as part of this investigation section; this memo update only documents findings and an execution plan for SWR approval.

