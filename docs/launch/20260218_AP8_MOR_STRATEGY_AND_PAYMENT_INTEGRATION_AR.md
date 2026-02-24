# AP 8: MoR Strategy & Payment Integration (Amended & Restated)

**Date:** February 18, 2026
**Author:** General Counsel
**Status:** DRAFT — awaiting SWR review
**Priority:** Launch blocker
**Estimated total effort:** ~6–8 hours (down from ~15–25h under prior plan)
**Supersedes:** `20260218_AP8_MOR_STRATEGY_AND_PAYMENT_INTEGRATION.md` (preserved for contingency reference)
**Companion documents:** `20260218_STRIPE_MANAGED_PAYMENTS_DISCOVERY.md`, `20260218_REPORT_ON_SMP_APPROVAL_PROCESS.md`

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Background & Guiding Principle](#2-background--guiding-principle)
3. [Current State](#3-current-state)
4. [Phase 1: Assessment & Legal Review](#4-phase-1-assessment--legal-review)
5. [Phase 2: SMP Code Integration (Test Mode)](#5-phase-2-smp-code-integration-test-mode)
6. [Phase 3: Stripe Operational Readiness](#6-phase-3-stripe-operational-readiness)
7. [Phase 4: Production Promotion](#7-phase-4-production-promotion)
8. [Phase 5: Production Verification](#8-phase-5-production-verification)
9. [Post-Change Security Review](#9-post-change-security-review)
10. [Fee Impact Assessment](#10-fee-impact-assessment)
11. [Customer Experience Changes](#11-customer-experience-changes)
12. [Effort & Timeline Summary](#12-effort--timeline-summary)
13. [Consolidated Stripe Task Registry](#13-consolidated-stripe-task-registry)
14. [Contingency: SMP Path Unavailable](#14-contingency-smp-path-unavailable)
15. [Document History](#15-document-history)

---

## 1. Executive Summary

The discovery on February 18, 2026 that Stripe Managed Payments (SMP) is available on our existing Stripe account fundamentally transforms the payment integration strategy. Instead of migrating from Stripe to a separate Merchant of Record vendor (Lemon Squeezy standalone or Paddle), we can add global MoR capability to our existing Stripe integration through parameter-level code changes.

**This document replaces the prior AP 8 in its entirety.** It describes a single unified path from our current state (Stripe in test mode, SMP available but not activated) to production with live payments and a global MoR — the two goals being achieved through the same body of work, not separate efforts.

**Five phases:**

1. **Assessment & Legal Review** (~1.5–2h) — validate current integration, audit parameters, attorney review of SMP Preview Terms → GO/NO-GO gate
2. **SMP Code Integration** (~2–3h) — code changes in test mode, full re-verification
3. **Stripe Operational Readiness** (~30 min) — dashboard security, SMP setup completion
4. **Production Promotion** (~1–1.5h) — live mode, products, webhooks, secrets, env vars
5. **Production Verification** (~1h) — SWR's dogfooding purchase, full E2E confirmation

**What this eliminates from the prior plan:**

- The ~1 week MoR application review wait (no application needed — SMP is self-service)
- The 8–14 hour payment provider migration (parameter changes, not a rewrite)
- The DynamoDB field naming decision A-D1 (fields stay as `stripeCustomerId` — they store actual Stripe IDs)
- The LS Phase 1 feasibility assessment and Phase 2 migration specification (not needed unless contingency triggered)
- The Paddle parallel application planning (retained only as contingency)

**What remains from the prior plan:** The detailed LS migration analysis (prior AP 8, Path A) and Paddle backup (Path B) are preserved as contingency documentation. If the SMP Preview Terms fail SWR's attorney review, the prior AP 8 describes the fallback paths in full.

---

## 2. Background & Guiding Principle

### The MoR Imperative (Unchanged)

Without a Merchant of Record, SWR personally bears global tax compliance obligations — calculating, collecting, remitting, and filing sales tax / VAT / GST in every jurisdiction where a customer purchases a license. This is operationally unworkable for a solo founder at any scale. An MoR handles it all: they become the legal seller of record, collect payment, manage global tax obligations, and remit net revenue minus their fee.

### From Migration to Configuration

Prior AP 8 assumed MoR required migrating away from Stripe to a separate vendor (LS or Paddle). SMP eliminates this assumption. Stripe now offers MoR capability directly through its existing infrastructure. Our existing Stripe integration, verification, products, and tax categories are all preserved. The only changes are parameter-level: adding one flag, one version header, and removing parameters that SMP controls.

### Guiding Principle

> Readying Stripe for promotion to live mode and readying SMP for promotion as our global MoR are **the same body of work**. Every step that prepares our Stripe integration for production simultaneously prepares it for MoR operation. There is no separate "MoR migration" — there is only "Stripe production readiness, with MoR enabled."

---

## 3. Current State

### Stripe Account

| Aspect                    | Status                                                                     |
| ------------------------- | -------------------------------------------------------------------------- |
| Account active            | ✅                                                                         |
| Business profile complete | ✅ (SWR completed)                                                         |
| Mode                      | Test mode                                                                  |
| Products & prices         | 4 products configured (Individual Monthly/Annual, Business Monthly/Annual) |
| Tax category              | SaaS — electronic download — business use (`txcd_10103101`) ✅ Updated Feb 23 |
| Webhook endpoint          | `staging.hic-ai.com/api/webhooks/stripe` (8 events)                        |
| Live mode available       | ✅ Instant (business profile complete)                                     |

### SMP Status

| Aspect                 | Status                                                           |
| ---------------------- | ---------------------------------------------------------------- |
| Dashboard availability | ✅ Available (Settings → Managed Payments)                       |
| Product recognition    | ✅ Existing products and tax categories detected                 |
| Setup progress         | Saved at Step 3 of 4-step guided setup                           |
| Terms accepted         | ✅ SWR attorney review complete Feb 23 — GO                      |
| Test transaction       | ❌ Not yet attempted                                             |
| Activation confidence  | ~85–90% (self-service, no application — see SMP Approval Report) |

### Integration Surface Area

The prior AP 8 inventoried the full Stripe integration surface area: ~37 files across ~15,750 lines. The critical architectural insight is that **with SMP, only the Checkout Session creation code changes.** Everything downstream is unaffected:

| Component                                      | Files | Changes Required                                         |
| ---------------------------------------------- | ----- | -------------------------------------------------------- |
| Checkout Session creation                      | 1–2   | **YES** — add SMP flag, remove ~16 forbidden params      |
| Stripe SDK configuration                       | 1     | **YES** — add preview version header                     |
| Webhook handlers (8 events)                    | 1     | **NO** — events still fire identically                   |
| DynamoDB access (customer/org records)         | 5+    | **NO** — same fields, same values                        |
| Portal routes (billing, seats, portal session) | 3     | **NO** — customer portal unchanged                       |
| Client-side pages                              | 7     | **MINOR** — copy changes (see §11)                       |
| Cognito integration                            | 3     | **NO** — `custom:stripe_customer_id` unchanged           |
| Keygen licensing                               | All   | **NO** — completely decoupled from payment layer         |
| Test files                                     | 9     | **MINOR** — update Checkout Session parameter assertions |

**True change surface: ~2–3 files for functional changes, ~2–3 files for test/copy updates.**

For the complete Stripe integration inventory (SDK functions, webhook events, DynamoDB fields, file-by-file breakdown), see the prior AP 8 (§ Current Stripe Integration Surface Area).

---

## 4. Phase 1: Assessment & Legal Review

**Purpose:** Validate current integration state, understand exact code changes required, assess fee impact, and obtain SWR's attorney review of SMP Preview Terms as the GO/NO-GO gate.
**Dependencies:** None — this is the entry point for all payment work.
**Effort:** ~1.5–2 hours

### Steps

#### 1.1 — Verify All 4 Test-Mode Checkout Paths (30 min)

_Absorbs prior AP 0, item 0.9._

In Stripe test mode, verify all 4 checkout paths end-to-end:

1. Individual Monthly → checkout → webhook → Keygen license created → DynamoDB record
2. Individual Annual → same
3. Business Monthly → same
4. Business Annual → same

For each path, confirm: Stripe checkout session creates, payment succeeds in test mode, webhook fires to staging endpoint, license is provisioned in Keygen, DynamoDB record written correctly.

**Why first:** Establishes ground truth of current behavior before any parameter changes. Phase 2 re-verification must compare against confirmed baseline.

#### 1.2 — Audit Forbidden Parameters Against Our Code (30 min)

_Absorbs SMP Discovery Memo §6, Open Question #2._

Review `src/lib/stripe.js` and the checkout API route. For each of the ~16 parameters that SMP controls and forbids in Checkout Session creation, determine which our code actually uses:

**Forbidden parameters (from Stripe docs):**

- `automatic_tax`
- `tax_id_collection`
- `subscription_data.default_tax_rates`
- `payment_method_collection`
- `payment_method_configuration`
- `payment_method_options`
- `payment_method_types`
- `saved_payment_method_options`
- `customer_update[name]`
- Statement descriptor overrides
- `receipt_email`
- Invoice creation controls
- Shipping/address collection
- Connect transfer parameters
- Additional parameters per Stripe's current SMP documentation

**Deliverable:** A checklist of which forbidden parameters our code uses, and for each, whether removal is straightforward or requires logic changes.

#### 1.3 — Fee Assessment (15 min)

_Absorbs SMP Discovery Memo §10, Open Question #5._

Confirm the SMP fee structure from the Stripe Dashboard or SMP terms. Expected: 3.5% on top of standard Stripe processing fees (2.9% + $0.30 for US cards). See §10 of this document for the projected per-plan impact.

#### 1.4 — Attorney Review of SMP Preview Terms (30–60 min)

_Absorbs SMP Discovery Memo §7 (all items), prior AP 11 SMP terms cross-reference._

SWR reviews the Stripe Managed Payments Service Terms as attorney. Seven provisions merit specific attention (summarized from the Discovery Memo's detailed analysis):

| #   | Provision                            | Key Concern                                                                                                                                                                                                      |
| --- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7.1 | **Preview Status**                   | Stripe may change/discontinue features without notice. Mitigation: underlying Stripe Payments infrastructure is standard and remains functional — MoR layer is additive.                                         |
| 7.2 | **60-Day Refund Discretion**         | SMP (Lemon Squeezy LLC) may issue refunds within 60 days regardless of our policy. Seller bears the cost.                                                                                                        |
| 7.3 | **48-Hour Dispute Response SLA**     | Must respond to dispute info requests within 48 hours or SMP may refund unilaterally. Operational burden for solo founder.                                                                                       |
| 7.4 | **Connected Account Treatment**      | Seller's Stripe account becomes a Connected Account to SMP as Platform. Funds in pooled accounts. May affect fund availability/payout timing.                                                                    |
| 7.5 | **Customer Data Deletion Cascading** | Customers can request deletion; Stripe will cancel subscriptions and delete related objects. Our Keygen/DynamoDB layer must tolerate orphaned `stripeCustomerId` references. Risk: Low (licensing is decoupled). |
| 7.6 | **Indemnification**                  | Seller indemnifies Stripe/SMP for product-related and IP claims. Standard for MoR but should be reviewed.                                                                                                        |
| 7.7 | **Tax on Refunded Transactions**     | In some jurisdictions, sales tax may still be remitted on refunded transactions. Unusual edge case.                                                                                                              |

Full detail on each provision is in `20260218_STRIPE_MANAGED_PAYMENTS_DISCOVERY.md` §7.

#### 1.5 — GO/NO-GO Decision

**✅ GO — Feb 23, 2026.** SWR conducted comprehensive attorney review of all Stripe documentation: SMP Preview Terms, General Terms (SSA), Data Processing Agreement, payment method provisions (ACH, Link, Google Pay, etc.), all regional terms affecting US customers, and related materials. Decision: SMP terms acceptable. Proceed to Phase 2.

> ⚠️ **PRE-LAUNCH INVESTIGATION REQUIRED:** Stripe customer data deletion mechanics. If a customer requests account deletion via Stripe, Stripe will cancel subscriptions and delete related objects. Investigation needed into downstream consequences on DynamoDB table lookups (potential null values for `stripeCustomerId`/`stripeSubscriptionId`) and overall functionality. Not blocking for Phase 2 code work, but must be resolved before production launch.

### Phase 1 Exit Criteria

> **⚠️ RESEQUENCED (Feb 24, DEFER-1B):** Steps 1.1–1.3 are now executed in Phase 3 Stream 3C Part 1, not Phase 1 of the launch plan. See deferral recommendation memo (`docs/plg/20260224_RECOMMENDATION_RE_DEFERRING_LAUNCH_PLAN_STREAM_1B_SMP_TO_PHASE_3.md`).

- [ ] All 4 test-mode checkout paths verified end-to-end
- [ ] Forbidden parameter audit complete — specific parameters identified in our code
- [ ] Fee structure confirmed
- [x] Attorney review complete — **GO** decision documented (Feb 23, 2026)
- [x] GO confirmed: ready for Phase 2 code changes

---

## 5. Phase 2: SMP Code Integration (Test Mode)

> **⚠️ RESEQUENCED (Feb 24, DEFER-1B):** This phase is now executed in Phase 3 Stream 3C Part 1 of the launch plan, not Phase 1. Rationale: avoid premature SMP activation before website/legal/social are complete; consolidate all Stripe/SMP work into a single Phase 3 session. See deferral recommendation memo (`docs/plg/20260224_RECOMMENDATION_RE_DEFERRING_LAUNCH_PLAN_STREAM_1B_SMP_TO_PHASE_3.md`).

**Purpose:** Modify the Checkout Session creation code to enable SMP, then verify the entire payment flow still works in test mode.
**Dependencies:** Phase 1 GO decision.
**Effort:** ~2–3 hours

### Steps

#### 2.1 — Add SMP Parameters to Checkout Session Creation (15 min)

Add to every `checkout.sessions.create()` call:

```
managed_payments: { enabled: true }
```

#### 2.2 — Set Preview Version Header (15 min)

Configure the Stripe SDK instance or per-request to include:

```
Stripe-Version: 2025-03-31.basil; managed_payments_preview=v1
```

**Implementation note:** Determine whether this is best set globally on the Stripe client initialization or per-request on Checkout Session creation. Global is simpler; per-request limits scope. Either is acceptable for v1.

#### 2.3 — Remove Forbidden Parameters (1–2h)

For each forbidden parameter identified in Step 1.2, remove it from Checkout Session creation. Two implementation approaches:

| Approach                    | Tradeoff                                                                   |
| --------------------------- | -------------------------------------------------------------------------- |
| **(a) Remove entirely**     | Clean, minimal code. Rollback requires re-adding parameters.               |
| **(b) Guard behind a flag** | `if (SMP_ENABLED)` conditional — one-flag rollback. Slightly more complex. |

**Recommendation:** Approach (a) for v1. The parameters are documented in this plan and the Discovery Memo — re-adding them is straightforward if SMP is ever disabled. Approach (b) is justified only if SWR wants a fast runtime toggle.

**Key question during implementation:** For parameters like `automatic_tax` — does SMP handle tax calculation automatically, or does removing this parameter mean taxes are no longer calculated? The answer should be: SMP as MoR handles all tax, so removing `automatic_tax` is correct behavior (SMP calculates tax on its side). Verify this during Step 2.4.

#### 2.4 — Re-Verify All 4 Checkout Paths (30 min)

Repeat the Step 1.1 verification with SMP enabled. Confirm:

- Checkout session creates successfully (no parameter validation errors)
- Payment completes in test mode
- Webhook fires with expected event payloads
- License provisioned in Keygen
- DynamoDB record written correctly
- Compare results against Step 1.1 baseline — identify any differences

**Critical check:** Verify that webhook event payloads are structurally identical to pre-SMP payloads. If field names or nesting changed, webhook handler logic may need updates.

#### 2.5 — Verify Webhook Flow (15 min)

Confirm all 8 webhook events still fire and process correctly:

| Event                           | Expected Behavior                              |
| ------------------------------- | ---------------------------------------------- |
| `checkout.session.completed`    | License provisioning, DynamoDB upsert          |
| `customer.subscription.created` | Log-only                                       |
| `customer.subscription.updated` | Status sync, Keygen suspend/reinstate          |
| `customer.subscription.deleted` | Status → canceled, Keygen suspend              |
| `invoice.payment_succeeded`     | Expiry update, reactivation                    |
| `invoice.payment_failed`        | Status → past_due, suspension after 3 failures |
| `charge.dispute.created`        | Immediate license suspension                   |
| `charge.dispute.closed`         | Reinstate or keep suspended                    |

Not all events can be triggered in a single test session. At minimum, verify `checkout.session.completed` and `customer.subscription.updated` fire correctly. The remaining events use the same webhook signature verification and handler dispatch — if those two work, the others are structurally sound.

#### 2.6 — Verify Customer Portal & Subscription Management (15 min)

- `billingPortal.sessions.create()` — confirm redirect works
- Subscription management (cancel, update) — confirm flows complete
- Note any differences in portal behavior with SMP enabled

#### 2.7 — Verify Email Notification Flow (15 min)

With SMP, Link also sends customer communications (order confirmations, receipts). Verify:

- Our SES transactional emails still fire (welcome, license delivery, payment confirmation)
- Identify any duplication between Link-sent and HIC-AI-sent emails
- If duplication exists, determine which to suppress (likely: suppress our payment confirmation email since Link sends its own receipt)

#### 2.8 — Run Existing Test Suite (15 min)

Confirm all 3,459 tests pass. Update any Checkout Session parameter assertions in test files to reflect removed parameters and added SMP flag.

### Phase 2 Exit Criteria

- [ ] SMP parameters added to Checkout Session creation
- [ ] Preview version header configured
- [ ] All forbidden parameters removed from Checkout Session creation
- [ ] All 4 checkout paths verified E2E in test mode with SMP enabled
- [ ] Webhook events confirmed firing with correct payloads
- [ ] Customer portal functional
- [ ] Email notification duplication assessed and resolved
- [ ] All tests pass (count: ≥3,459)

---

## 6. Phase 3: Stripe Operational Readiness

**Purpose:** Secure the Stripe dashboard and complete the SMP setup flow before going live.
**Dependencies:** Phase 2 complete (SMP confirmed working in test mode).
**Effort:** ~30 minutes

### Steps

#### 3.1 — Enable 2FA on Stripe Dashboard (5 min)

_Absorbs prior AP 2b 2FA Stripe item._

Enable two-factor authentication for the Stripe dashboard account. This is account-level operational security that should be in place before live payments.

#### 3.2 — Complete SMP Setup Steps 3–4 in Dashboard (10 min)

SWR saved progress at Step 3 of Stripe's 4-step Managed Payments setup flow. Complete the remaining steps:

- Step 3: Review/confirm configuration (if not yet completed)
- Step 4: Accept terms and activate (after attorney review in Phase 1)

**Note:** This may be the step where the SMP Preview Terms are formally accepted in the dashboard. Coordinate with Phase 1.4 — attorney review happens intellectually first, dashboard acceptance happens here.

#### 3.3 — Confirm Tax Category Settings (5 min)

~~Verify that our products' tax category (downloadable software, business use) is correctly configured and recognized by SMP.~~ ✅ **Completed Feb 23.** Tax code changed from `txcd_10202003` (downloadable software — business use) to `txcd_10103101` (SaaS — electronic download — business use) on all 4 products. SaaS classification is correct for a subscription-licensed extension with heartbeat validation and continuous vendor-controlled updates. Decision made after attorney review of tax treatment differences across jurisdictions.

#### 3.4 — Review Stripe Notification Settings (10 min)

Ensure Stripe dashboard notifications are configured for:

- Dispute alerts (48-hour SLA per SMP terms §7.3 — SWR must respond promptly)
- Payout notifications
- Failed payment alerts
- Any SMP-specific notifications

### Phase 3 Exit Criteria

- [ ] 2FA enabled on Stripe dashboard
- [ ] SMP setup flow completed (all 4 steps)
- [ ] Tax categories confirmed
- [ ] Notification settings reviewed for 48-hour dispute SLA compliance

---

## 7. Phase 4: Production Promotion

**Purpose:** Switch Stripe from test mode to live mode and configure all production payment infrastructure.
**Dependencies:** Phase 2 complete; AP 4 C2 infrastructure in place (CloudFormation deployed, Amplify production environment exists, DNS resolved).
**Effort:** ~1–1.5 hours

_This phase executes during the AP 4 C2 convergence window. This document provides the Stripe-specific detail; AP 4 provides the overall infrastructure orchestration._

### Steps

#### 4.1 — Create Live-Mode Products and Prices (30 min)

_Absorbs AP 4 P6, step 6.2._

Recreate in live mode the test-mode products:

| Product                  | Price        | Live Price ID         |
| ------------------------ | ------------ | --------------------- |
| Mouse Individual Monthly | $15/mo       | Record after creation |
| Mouse Individual Annual  | $150/yr      | Record after creation |
| Mouse Business Monthly   | $35/seat/mo  | Record after creation |
| Mouse Business Annual    | $350/seat/yr | Record after creation |

**Ordering matters:** Live-mode price IDs are needed for the Amplify env vars in Step 4.4. Create products first.

Confirm each product has the correct tax code assigned: `txcd_10103101` (SaaS — electronic download — business use). ✅ Updated Feb 23.

#### 4.2 — Create Live-Mode Webhook Endpoint (15 min)

_Absorbs AP 4 P6, steps 6.3–6.4._

- **Endpoint URL:** `https://hic-ai.com/api/webhooks/stripe`
- **Events (8):** `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`, `charge.dispute.created`, `charge.dispute.closed`
- **Record:** Webhook signing secret → needed for Secrets Manager in Step 4.3

#### 4.3 — Populate Production Secrets (15 min)

_Absorbs AP 4 P3 (Stripe-specific secrets)._

Create in AWS Secrets Manager:

```
plg/production/stripe
├── STRIPE_SECRET_KEY         → sk_live_...
├── STRIPE_WEBHOOK_SECRET     → whsec_... (from Step 4.2)
└── STRIPE_PUBLISHABLE_KEY    → pk_live_...
```

**Note:** These are the same secret paths as staging but under `plg/production/`. Staging secrets remain untouched.

#### 4.4 — Set Amplify Production Environment Variables (15 min)

_Absorbs AP 4 P4 and P6, step 6.4 (Stripe-specific env vars)._

Using `./scripts/update-amplify-env.sh`:

```bash
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
NEXT_PUBLIC_STRIPE_PRICE_INDIVIDUAL_MONTHLY=price_...
NEXT_PUBLIC_STRIPE_PRICE_INDIVIDUAL_ANNUAL=price_...
NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_MONTHLY=price_...
NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_ANNUAL=price_...
```

Trigger Amplify rebuild after env var update.

#### 4.5 — Confirm SMP Active in Live Mode (5 min)

Navigate to Stripe Dashboard (live mode) → Settings → Managed Payments. Confirm SMP is active and products are recognized in live mode, not just test mode.

If SMP requires separate activation in live mode (distinct from test mode), complete that step here.

#### 4.6 — Confirm Keygen Production Webhook (5 min)

_Cross-reference: AP 4 P6, step 6.5._

Verify Keygen production webhook endpoint points to `https://hic-ai.com/api/webhooks/keygen`. (Keygen is already in live mode and is independent of Stripe/SMP — this step is included here for completeness of vendor endpoint configuration.)

### Phase 4 Exit Criteria

- [ ] 4 live-mode products with correct prices and tax codes
- [ ] Live webhook endpoint receiving events at `hic-ai.com`
- [ ] Webhook signing secret in Secrets Manager
- [ ] All 5 Stripe env vars set in Amplify production
- [ ] SMP confirmed active in live mode
- [ ] Keygen production webhook confirmed

---

## 8. Phase 5: Production Verification

**Purpose:** Confirm the complete payment → licensing → notification flow works in production with real money.
**Dependencies:** Phase 4 complete; AP 4 C2 fully complete (Cognito, DynamoDB, Lambdas, SES — all production).
**Effort:** ~1 hour

_This phase executes as part of AP 4 P8 / C3. SWR's dogfooding subscription purchase (OI-4) is simultaneously the payment verification AND the live-payment test._

### Steps

#### 5.1 — SWR Dogfooding Purchase (15 min)

_Absorbs OI-4 / AP 4 P8._

SWR purchases a Mouse Individual Monthly subscription ($15/mo) through the production checkout flow. Real payment, real subscription, real license. HIC AI, Inc. Mercury account; ~$1–2 net monthly cost after SMP + Stripe fees on the first payout.

**First payout note:** Stripe holds first payouts for 7–14 days on new live-mode accounts. This is expected and does not indicate a problem.

#### 5.2 — Verify Full E2E Chain (20 min)

Confirm the post-purchase chain:

1. ✅ Checkout completed successfully
2. ✅ `checkout.session.completed` webhook fired
3. ✅ Keygen license created
4. ✅ DynamoDB customer record written (`stripeCustomerId`, `stripeSubscriptionId` populated)
5. ✅ Welcome email received (via SES)
6. ✅ License delivery email received
7. ✅ Payment confirmation email received (or Link receipt — whichever was chosen in Phase 2.7)

#### 5.3 — Verify Extension Activation (15 min)

Using SWR's production license:

1. Install Mouse extension
2. Authenticate via production Cognito
3. Activate license via production Keygen
4. Confirm heartbeat succeeds
5. Verify MCP tools are functional

#### 5.4 — Verify Customer Portal (5 min)

- Access customer portal via production website
- Confirm subscription is visible and manageable
- Confirm billing information is accessible

#### 5.5 — Verify MoR Compliance (5 min)

Confirm the customer-facing MoR indicators are present:

- Receipt/invoice shows appropriate entity (Link / Lemon Squeezy LLC)
- Customer credit card statement description is acceptable
- Checkout page reflects MoR branding

### Phase 5 Exit Criteria

- [ ] SWR's subscription active and live
- [ ] Full E2E chain verified (checkout → webhook → license → DynamoDB → emails)
- [ ] Extension activation works against production
- [ ] Customer portal functional
- [ ] MoR indicators confirmed on customer-facing materials

---

## 9. Post-Change Security Review

**Purpose:** Targeted security review of the code changes introduced by SMP integration. This is NOT a full security audit (that's AP 2b) — it's a focused check ensuring the Phase 2 code changes don't introduce regressions.
**Dependencies:** Phase 2 code changes committed.
**Effort:** ~30 minutes

### Scope

| Check                        | What to Verify                                                                                     |
| ---------------------------- | -------------------------------------------------------------------------------------------------- |
| Checkout Session parameters  | No secrets or sensitive values exposed after parameter changes                                     |
| Preview version header       | Set server-side only; not leaked to client                                                         |
| Webhook signature validation | `constructEvent()` call unchanged and functional                                                   |
| Error handling               | Checkout route error responses don't expose stack traces or internal state                         |
| Client-side bundle           | No new secrets introduced; `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is the only Stripe value in client |
| `npm audit`                  | Run if any Stripe package version was changed (unlikely — SMP doesn't require package changes)     |

### Exit Criteria

- [ ] No security regressions in modified files
- [ ] Webhook signature validation confirmed intact
- [ ] Client-side bundle clean

---

## 10. Fee Impact Assessment

### Expected Fee Structure

SMP charges 3.5% on top of standard Stripe processing fees (confirmed from Stripe's published SMP pricing). **Note:** The SMP fee is calculated on the full transaction amount _including any applicable indirect taxes_ (sales tax, VAT, GST). This means HIC AI's effective fee rate per transaction is slightly higher when tax is assessed — see §10.3 below.

**Projected total cost per transaction (US card):**

| Plan                      | Price   | Stripe (2.9% + $0.30) | SMP (3.5%) | Total Fees | Net Revenue | Effective Rate |
| ------------------------- | ------- | --------------------- | ---------- | ---------- | ----------- | -------------- |
| Individual Monthly        | $15/mo  | $0.74                 | $0.53      | $1.26      | $13.74      | 8.4%           |
| Individual Annual         | $150/yr | $4.65                 | $5.25      | $9.90      | $140.10     | 6.6%           |
| Business Monthly (1 seat) | $35/mo  | $1.32                 | $1.23      | $2.54      | $32.46      | 7.3%           |
| Business Annual (1 seat)  | $350/yr | $10.45                | $12.25     | $22.70     | $327.30     | 6.5%           |

### Comparison to Alternatives

| Provider               | Effective Rate    | Migration Cost            | Wait Time                               |
| ---------------------- | ----------------- | ------------------------- | --------------------------------------- |
| **SMP**                | ~6.5–8.4%         | ~3–4h (parameter changes) | None                                    |
| LS standalone          | ~5% + $0.50/txn   | ~8–10h (full migration)   | ~1 week (application)                   |
| Paddle                 | ~5% + $0.50/txn   | ~10–14h (full migration)  | ~1 week (application)                   |
| Stripe direct (no MoR) | ~2.9% + $0.30/txn | 0h                        | None — but HIC AI, Inc. bears all tax compliance |

**Assessment:** SMP's effective rate (6.5–8.4%) is ~1–3 percentage points higher than LS/Paddle standalone (~5% + $0.50/txn), but the zero-migration-cost and zero-wait-time advantages dominate at early volumes. At the Individual Monthly price point ($15/mo), SMP and LS fees are nearly identical (~$1.26 vs ~$1.25 per transaction). The gap widens at higher price points — Business Annual ($350/yr) costs ~$4.70 more per transaction under SMP than LS. At 50 monthly Individual subscribers, the monthly fee difference is negligible; even at 50 Business Monthly subscribers ($35/mo), the extra SMP cost is approximately $15/mo. The 5–10 hours of saved development time and ~1 week of saved calendar time far outweigh these differences at any early-stage volume.

**When to reconsider:** If SMP fees materially impact unit economics at scale (hundreds of subscriptions), reassessing the LS standalone path becomes worthwhile — by that point the business would have the revenue and traction to support a deliberate migration.

### 10.3 Tax Pass-Through and Its Effect on Revenue

#### How SMP Handles Tax

With SMP as Merchant of Record, **tax is not a cost-of-goods-sold (COGS) item for HIC AI.** The mechanics:

1. **HIC AI, Inc. sets prices exclusive of tax.** The listed prices ($15/mo, $150/yr, $35/seat/mo, $350/seat/yr) are the pre-tax amounts.
2. **SMP calculates applicable tax at checkout.** Based on the customer's location, SMP determines what sales tax, VAT, or GST applies and adds it to the checkout total. A customer in Texas (8.25% sales tax on digital goods) purchasing the $15/mo plan would see $15.00 + $1.24 tax = $16.24 at checkout.
3. **SMP collects the full amount** (price + tax) from the customer's payment method.
4. **SMP remits the tax** to the relevant tax authority. HIC AI never touches the tax funds and has no filing obligation in SMP-covered jurisdictions (75+ countries).
5. **HIC AI, Inc. receives: listed price minus fees.** The Stripe processing fee and SMP fee are the only deductions from HIC AI's revenue.

#### Why the Fee Base Matters

The SMP 3.5% fee (and Stripe's 2.9% + $0.30) is calculated on the _full transaction amount including tax_. This means HIC AI's effective fee cost is slightly higher when tax is present:

| Plan              | Pre-Tax | Tax (8% example) | Customer Pays | Stripe Fee | SMP Fee | Total Fees | HIC AI Net | vs. No-Tax Net |
| ----------------- | ------- | ----------------- | ------------- | ---------- | ------- | ---------- | --------- | -------------- |
| Individual Mo.    | $15.00  | $1.20             | $16.20        | $0.77      | $0.57   | $1.34      | $13.66    | −$0.08         |
| Individual Ann.   | $150.00 | $12.00            | $162.00       | $5.00      | $5.67   | $10.67     | $139.33   | −$0.77         |
| Business Mo.      | $35.00  | $2.80             | $37.80        | $1.40      | $1.32   | $2.72      | $32.28    | −$0.18         |
| Business Ann.     | $350.00 | $28.00            | $378.00       | $11.26     | $13.23  | $24.49     | $325.51   | −$1.79         |

**Key takeaway:** When tax applies, HIC AI nets slightly less per transaction (the "vs. No-Tax Net" column) because Stripe and SMP both calculate their percentage fees on the larger tax-inclusive amount. The delta ranges from $0.08/mo (Individual Monthly) to $1.79/yr (Business Annual) — immaterial at any volume.

#### HIC AI Revenue Model (Summary)

```
  Listed Price (set by HIC AI, Inc.)
− Stripe processing fee (2.9% + $0.30 on gross including tax)
− SMP fee (3.5% on gross including tax)
──────────────────────────────────────────────────────────
= HIC AI Net Revenue

  Tax collected by SMP (remitted to tax authority, never touches HIC AI)
```

**HIC AI, Inc. does NOT need to:**
- Register for sales tax / VAT in SMP-covered jurisdictions
- File tax returns for those jurisdictions
- Track or remit any tax amounts
- Display tax-inclusive prices (SMP adds tax at checkout automatically)

**HIC AI, Inc. DOES need to:**
- Set the pre-tax price for each product in Stripe (the prices in the product table above)
- Assign the correct tax code to each product ("downloadable software, business use" — done in Phase 4.1)
- Understand that the effective fee rate is 6.5–8.4% on the pre-tax price (or slightly higher in tax-present transactions)

#### Refund Tax Implications

Per Stripe's SMP transaction support documentation:
- Customer refunds include any sales tax the customer paid
- In certain jurisdictions, Stripe must retain and remit the original tax amount even on refunded transactions — meaning HIC AI's balance decreases by the tax portion of the refund in those jurisdictions
- SMP provides a 60-day refund discretion window
- This is a standard MoR behavior and matches LS/Paddle policy


---

## 11. Customer Experience Changes

With SMP enabled, the customer-facing checkout experience changes slightly:

| Aspect                | Without SMP                       | With SMP                                    |
| --------------------- | --------------------------------- | ------------------------------------------- |
| Seller identity       | HIC AI, Inc.                      | "Sold through Link" (Lemon Squeezy LLC)     |
| Credit card statement | HIC AI or configurable descriptor | Link / Lemon Squeezy LLC (SMP-controlled)   |
| Receipts / invoices   | From Stripe on behalf of HIC AI   | From Link                                   |
| Transaction support   | HIC AI support                    | Link handles first-line transaction support |
| Refund authority      | HIC AI controls                   | SMP may issue refunds within 60 days (§7.2) |

### Cross-References to Other Action Plans

These customer experience changes may require updates in:

| Document / Page       | What to Update                                       | Owner AP    |
| --------------------- | ---------------------------------------------------- | ----------- |
| FAQ / Pricing page    | Note that checkout is "powered by Link" or similar   | AP 1        |
| Privacy Policy        | Payment processor entity (Lemon Squeezy LLC / Link)  | AP 11       |
| Terms of Service      | Seller of record for transactions                    | AP 11       |
| Support documentation | "Why does my card statement say Link/Lemon Squeezy?" | AP 5 / AP 6 |
| Refund policy         | Align with SMP's 60-day discretion                   | AP 11       |

These are flagged here for completeness but executed as part of their respective action plans.

---

## 12. Effort & Timeline Summary

| Phase     | Description                      | Effort    | Dependencies                    |
| --------- | -------------------------------- | --------- | ------------------------------- |
| **1**     | Assessment & Legal Review        | ~1.5–2h   | None                            |
| **2**     | SMP Code Integration (Test Mode) | ~2–3h     | Phase 1 GO                      |
| **3**     | Stripe Operational Readiness     | ~30 min   | Phase 2                         |
| **4**     | Production Promotion             | ~1–1.5h   | Phase 2; AP 4 C2 infrastructure |
| **5**     | Production Verification          | ~1h       | Phase 4; AP 4 C2 complete       |
| **Post**  | Security Review                  | ~30 min   | Phase 2 code committed          |
| **Total** |                                  | **~6–8h** |                                 |

### Scheduling Flexibility

This plan does **not** prescribe when each phase executes relative to other action plans — that is the Dependency Map's role. However, the key scheduling constraints are:

1. **Phases 1–2 execute in Phase 3 of the launch plan (Stream 3C Part 1).** Per DEFER-1B (Feb 24), AP 8 AR Phases 1–2 were resequenced from launch Phase 1 to launch Phase 3 Stream 3C. They no longer execute early in the sprint. See deferral recommendation memo.
2. **Phase 3 (Stripe Operational Readiness) executes in launch Phase 3 Stream 3C Part 2.** Immediately follows Phases 1–2 within the same stream.
3. **Phase 4 requires AP 4 C2 infrastructure.** CloudFormation stack, Cognito, Secrets Manager paths, and Amplify production environment must exist before live-mode Stripe configuration.
4. **Phase 5 requires AP 4 C2 fully complete.** The dogfooding purchase is a full-stack E2E test — every infrastructure layer must be production.
5. **The Post-Change Security Review can execute anytime after Phase 2 code is committed.** It does not need to wait for Phase 4 or 5. It is naturally performed as part of AP 2b or as a standalone check.

### What This Replaces in the Prior Timeline

| Prior Plan Element                   | Prior Timing               | New Status                                                                   |
| ------------------------------------ | -------------------------- | ---------------------------------------------------------------------------- |
| AP 0 item 0.9 (Stripe E2E)           | Phase 0, Day 1             | → Phase 1.1 of this plan                                                     |
| AP 0 item 0.10 (MoR feasibility)     | Phase 0, Day 1             | **Eliminated** — SMP removes the need for a migration feasibility assessment |
| AP 0 item 0.11 (SMP dashboard check) | Phase 0                    | ✅ Already completed (Feb 18)                                                |
| AP 8 Phase 1 (LS feasibility)        | Phase 0 / early Track A    | **Deferred to contingency only**                                             |
| AP 8 Phase 2 (LS migration spec)     | MoR wait window (~Day 5–6) | **Deferred to contingency only**                                             |
| A-D1 (DynamoDB field naming)         | Phase 0 / SWR decision     | **Eliminated** — fields store actual Stripe IDs                              |
| MoR applications (A7)                | Day 4                      | **Eliminated from critical path** — may still submit as insurance (see §14)  |
| ~1 week MoR wait                     | Days 4–10                  | **Eliminated** — no external application needed                              |
| Payment migration execution (A8)     | Day 10                     | **Replaced** by Phase 2 of this plan (~2–3h instead of 8–14h)                |
| Post-migration security spot-check   | Day 11                     | **Simplified** to ~30 min (smaller change surface)                           |
| AP 4 P3/P6 Stripe items              | Day 12 (C2)                | → Phase 4 of this plan (unchanged in substance)                              |
| SWR dogfooding purchase (P8/OI-4)    | Day 13 (C3)                | → Phase 5 of this plan (unchanged in substance)                              |
| AP 2b 2FA on Stripe                  | Day 7 (Track B)            | → Phase 3.1 of this plan                                                     |
| AP 11 SMP terms review               | Day 2 (A2)                 | → Phase 1.4 of this plan                                                     |

---

## 13. Consolidated Stripe Task Registry

Every Stripe-specific task from across all planning documents, showing its source and disposition under this Amended & Restated plan.

| Task                                   | Source Document            | Prior Location          | Disposition                                 |
| -------------------------------------- | -------------------------- | ----------------------- | ------------------------------------------- |
| Verify 4 test-mode checkout paths      | AP 0, item 0.9             | Phase 0, Day 1          | **Absorbed** → Phase 1.1                    |
| MoR feasibility assessment             | AP 0, item 0.10            | Phase 0, Day 1          | **Eliminated** — no migration to assess     |
| SMP dashboard availability check       | AP 0, item 0.11            | Phase 0                 | ✅ **Completed** Feb 18                     |
| LS Phase 1 (Stripe→LS concept mapping) | AP 8 (prior), Path A       | Phase 0 / early Track A | **Deferred** — contingency only             |
| A-D1 DynamoDB field naming decision    | AP 8 (prior), Path A       | Phase 0                 | **Eliminated** — no rename needed           |
| LS Phase 2 migration specification     | AP 8 (prior), Path A       | MoR wait window         | **Deferred** — contingency only             |
| LS/Paddle application emails           | AP 8 (prior), A7           | Day 4                   | **Deferred** — optional insurance           |
| Payment migration execution            | AP 8 (prior), A8           | Day 10                  | **Replaced** by Phase 2 (parameter changes) |
| Post-migration security spot-check     | AP 8 (prior), §2.8         | Day 11                  | **Simplified** → §9 of this plan            |
| Stripe dashboard 2FA                   | AP 2b                      | Track B, Day 7          | **Absorbed** → Phase 3.1                    |
| SMP terms attorney review              | SMP Discovery Memo §7      | AP 11 / Step A2         | **Absorbed** → Phase 1.4                    |
| SMP parameter audit (~16 params)       | SMP Discovery Memo §6      | Unscheduled             | **Absorbed** → Phase 1.2                    |
| SMP code integration                   | SMP Discovery Memo §6      | Unscheduled             | **Absorbed** → Phase 2                      |
| SMP fee confirmation                   | SMP Discovery Memo §10, Q5 | Unscheduled             | **Absorbed** → Phase 1.3                    |
| Live-mode products and prices          | AP 4, P6 step 6.2          | C2, Day 12              | **Absorbed** → Phase 4.1                    |
| Live-mode webhook endpoint             | AP 4, P6 steps 6.3–6.4     | C2, Day 12              | **Absorbed** → Phase 4.2                    |
| Production Stripe secrets              | AP 4, P3                   | C2, Day 12              | **Absorbed** → Phase 4.3                    |
| Production Stripe env vars             | AP 4, P4/P6.4              | C2, Day 12              | **Absorbed** → Phase 4.4                    |
| SWR dogfooding purchase                | OI-4 / AP 4 P8             | C3, Day 13              | **Absorbed** → Phase 5.1                    |

---

## 14. Contingency: SMP Path Unavailable

If the SMP path cannot be used — whether because the Preview Terms fail SWR's attorney review (Phase 1.5 NO-GO), SMP is discontinued during Preview, or integration testing in Phase 2 reveals a blocking issue — the prior AP 8 documents the fallback paths in full:

**Reference:** `20260218_AP8_MOR_STRATEGY_AND_PAYMENT_INTEGRATION.md`

| Scenario                             | Fallback Path                                                          | Effort                            | Wait Time                               |
| ------------------------------------ | ---------------------------------------------------------------------- | --------------------------------- | --------------------------------------- |
| SMP terms unacceptable               | LS standalone + Paddle parallel applications (prior AP 8, Paths A + B) | 8–14h migration + 2h applications | ~1 week MoR review                      |
| SMP + LS both rejected (same entity) | Paddle standalone (prior AP 8, Path B)                                 | 10–14h                            | ~1 week Paddle review                   |
| SMP discontinued post-launch         | LS or Paddle migration with traction data                              | 8–14h                             | ~1 week                                 |
| All MoR options fail                 | Stripe direct, no MoR (prior AP 8, Path C)                             | 3–4h                              | None — but HIC AI, Inc. bears all tax compliance |

**If contingency is invoked:**

1. The prior AP 8's LS Phase 1 feasibility assessment and Phase 2 migration specification become active
2. The A-D1 DynamoDB field naming decision becomes relevant again
3. The MoR application wait window (~1 week) returns to the critical path
4. The Dependency Map must be revised to re-introduce Track A/B wait-window sequencing
5. Total sprint duration extends by ~5–7 days

**Optional insurance:** Even with SMP as the primary path, submitting LS and Paddle MoR applications during the sprint costs ~2 hours and provides fallback options if SMP's Preview status becomes problematic. The applications run in the background with zero critical-path impact. Whether to submit these is SWR's judgment call — the prior AP 8 describes the application process.

---

## 15. Document History

| Date       | Author | Changes                                                                                                                                                                                                                                                |
| ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-02-16 | GC     | Predecessor document: "Proposed Plans for Lemon Squeezy Migration" — LS-specific two-phase analysis                                                                                                                                                    |
| 2026-02-18 | GC     | First AP 8: Promoted to MoR Strategy & Payment Integration with three paths (LS primary, Paddle backup, Stripe fallback), dual-MoR application strategy, comprehensive LS migration planning                                                           |
| 2026-02-18 | GC     | **Amended & Restated AP 8:** Complete replacement. SMP as primary MoR path, 5-phase plan from current state to production, all Stripe tasks consolidated from AP 0/AP 4/AP 2b/AP 11/SMP Discovery Memo. Prior AP 8 preserved as contingency reference. |
| 2026-02-23 | SWR    | **SMP-GO.** Phase 1 Step 1.4 (Attorney Review) and Step 1.5 (GO/NO-GO) marked complete. SWR conducted comprehensive legal review of all Stripe documentation (SMP Preview Terms, General Terms, DPA, payment method provisions, regional terms). GO decision issued. SMP Status table updated. Phase 1 Exit Criteria attorney items checked. Pre-launch investigation flagged: Stripe customer data deletion impact on DynamoDB lookups. |
| 2026-02-24 | Kiro   | **DEFER-1B.** AP 8 AR Phases 1–2 resequenced to Phase 3 Stream 3C of the launch plan per approved deferral recommendation memo. Phase 1 Exit Criteria and Phase 2 header updated with resequencing notices. §12 Scheduling Flexibility updated: constraint #1 revised to reflect Phases 1–2 now execute in launch Phase 3 Stream 3C Part 1; constraint #2 revised for Phase 3 (Part 2). |
