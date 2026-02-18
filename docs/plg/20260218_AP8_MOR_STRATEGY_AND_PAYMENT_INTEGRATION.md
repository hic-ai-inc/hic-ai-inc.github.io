# AP 8: MoR Strategy & Payment Integration

**Date:** February 18, 2026 (revised from February 16 LS Migration document)
**Author:** General Counsel
**Status:** Not started
**Priority:** Launch blocker — the single most time-sensitive action plan
**Estimated effort:** 6–10 hours (LS integration) + 1–2 hours (Paddle application prep) + ~1 week external review wait
**Dependencies:** AP 0 (quick wins, including MoR feasibility assessment), AP 12 Phase 2 (MoR-ready social media presence), AP 1 (website polish for reviewer impression)
**Context:** Companion to `20260218_PRE_LAUNCH_STATUS_ASSESSMENT_AND_ACTION_PLANS_V2.md` and `20260216_ACTION_PLAN_DEPENDENCY_MAP.md`.

---

## Strategic Overview

This document is the comprehensive plan for securing a Merchant of Record (MoR) to handle global tax compliance before launch. It encompasses three paths in priority order:

1. **Lemon Squeezy (primary)** — preferred MoR; full feasibility assessment and migration planning documented in Sections 4–8 below (preserved from the original Feb 16 LS migration analysis)
2. **Paddle (parallel backup)** — application submitted simultaneously with LS; companion planning to be built out promptly after application submission
3. **Stripe direct (emergency fallback)** — live-mode Stripe without an MoR; adopted only if both LS and Paddle reject; significant tax compliance limitations acknowledged

**Planning philosophy:** Do as much MoR integration planning as possible *after* applying, not before. Pre-application effort is focused narrowly on making the applications as strong as possible. Post-application effort (during the ~1 week review window) fills in all the technical gaps. This ensures that if approved, execution can begin immediately — and if rejected, minimal planning effort was wasted on the rejected path.

---

## Table of Contents

1. [Strategic Overview](#strategic-overview)
2. [Strategic Context: The MoR Imperative](#strategic-context)
3. [Path A: Lemon Squeezy (Primary)](#path-a-lemon-squeezy-primary)
   - [Why Two Phases](#why-two-phases)
   - [Current Stripe Integration Surface Area](#current-stripe-integration-surface-area)
   - [Phase 1: Feasibility Assessment & Concept Mapping](#phase-1-feasibility-assessment--concept-mapping)
   - [Phase 2: Detailed Technical Migration Specification](#phase-2-detailed-technical-migration-specification)
   - [Key Architectural Insight: Licensing Is Decoupled](#key-architectural-insight-licensing-is-decoupled)
   - [The DynamoDB Field Naming Question](#the-dynamodb-field-naming-question)
4. [Path B: Paddle (Parallel Backup)](#path-b-paddle-parallel-backup)
5. [Path C: Stripe Direct (Emergency Fallback)](#path-c-stripe-direct-emergency-fallback)
6. [Decision Matrix](#decision-matrix)
7. [Timeline Integration](#timeline-integration)
8. [Next Steps](#next-steps)

---

## Path A: Lemon Squeezy (Primary)

> The following sections (Strategic Context through DynamoDB Field Naming Question) are preserved from the original February 16 LS migration analysis, with minor updates. This body of work represents the foundational planning for the preferred MoR path.

### Strategic Context

#### The MoR Imperative

Without a Merchant of Record, SWR personally bears global tax compliance obligations — calculating, collecting, remitting, and filing sales tax / VAT / GST in every jurisdiction where a customer purchases a license. This is operationally unworkable for a solo founder at any scale:

- **10 customers in 10 countries** = 10 separate tax compliance regimes, with insufficient revenue to justify professional tax help
- **10,000 customers overnight (viral scenario)** = potentially 100+ jurisdictions with immediate compliance exposure

Lemon Squeezy acts as MoR: they are the seller of record, collect the payment, handle all tax obligations globally, and remit net revenue to HIC AI minus their fee. SWR is willing to delay launch to have LS integrated from Day 1 to avoid this exposure entirely.

#### Prior History with LS

- **January 30, 2026:** LS declined initial MoR application, citing lack of "website and social media presence"
- **Invitation to reapply:** LS explicitly invited reapplication once those were in place
- **Current status:** Website is live at `staging.hic-ai.com`; social media accounts to be created per AP 12 Phase 2 before reapplication
- **Feb 17 decision:** Apply to LS *and* Paddle in parallel, not LS alone (hedges against second rejection)

#### Uncertainty Profile

LS approval is genuinely uncertain. The previous rejection was clear about what was missing (website + social), and both will exist before reapplication. But the ~1 week review timeline and binary approve/reject outcome mean we must plan for both paths without over-investing in either. The parallel Paddle application (Path B) hedges against this uncertainty.

---

### Why Two Phases

The two-phase approach balances planning rigor against the risk of wasted effort on an uncertain outcome.

| Phase       | Timing                                       | Cost       | Value If LS Approves                                                                                      | Value If LS Rejects                                                                   |
| ----------- | -------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Phase 1** | Early Track A (after AP 8.6 Stripe validation) | ~45–60 min | Confirms viability; surfaces critical decisions (DynamoDB naming); unblocks fast execution after approval | Clarifies architecture; the concept mapping and risk assessment are useful regardless |
| **Phase 2** | During LS wait window (after Track A Day ~4) | ~2–3 hours | Enables autonomous AI-agent execution of migration immediately upon approval                              | Wasted effort (but used what would otherwise be dead time)                            |

**Key scheduling insight:** Phase 2 is written during the LS wait window (~1 week), which is otherwise dead time for Track A. Writing it then is "free" from a critical-path perspective — it doesn't delay anything. But writing it _now_, before Track A even starts, would pre-invest 2–3 hours on a genuinely uncertain outcome with no scheduling benefit.

**The alternative of writing Phase 2 _after_ LS approval** is rejected because approval triggers a time-critical execution sprint. Every hour spent planning after approval is an hour of execution delayed. Having the spec ready means "LS approved → start coding immediately."

---

### Current Stripe Integration Surface Area

A preliminary inventory of the Stripe integration was conducted on February 16. This establishes the scope of what a migration would touch.

#### Summary Metrics

| Category                                                | Files   | Approx. Lines |
| ------------------------------------------------------- | ------- | ------------- |
| Core Stripe library (`src/lib/stripe.js`)               | 1       | 266           |
| API routes using Stripe SDK directly                    | 7       | ~2,000        |
| API routes referencing Stripe data (DynamoDB reads)     | 5       | ~1,550        |
| Client-side pages mentioning Stripe                     | 7       | ~2,200        |
| Supporting libs (secrets, constants, DynamoDB, cognito) | 6       | ~3,850        |
| Scripts (portal setup, metrics)                         | 2       | ~890          |
| Test files (unit, contract, E2E, mock factory)          | 9       | ~4,980        |
| **Total unique files**                                  | **~37** | **~15,750**   |

#### Stripe SDK Functions in Active Use

**Server-side (`stripe` npm package):**

- `checkout.sessions.create()` — hosted checkout session creation
- `checkout.sessions.retrieve()` — post-checkout verification + provisioning
- `billingPortal.sessions.create()` — customer portal redirect
- `webhooks.constructEvent()` — webhook signature verification
- `customers.retrieve()` — billing info display
- `subscriptions.list()` / `.retrieve()` / `.update()` — subscription management, seat changes, cancellation
- `paymentMethods.retrieve()` — billing page display
- `invoices.list()` — GDPR data export
- `promotionCodes.list()` — promo code lookup at checkout

**Client-side (`@stripe/stripe-js`):**

- `loadStripe()` — imported but only used for redirect URL pattern (no Stripe Elements rendered)

#### Webhook Events Handled (8 total)

| Stripe Event                    | Handler Action                                                             |
| ------------------------------- | -------------------------------------------------------------------------- |
| `checkout.session.completed`    | License provisioning, DynamoDB upsert, org creation (Business)             |
| `customer.subscription.created` | Log-only                                                                   |
| `customer.subscription.updated` | Status sync, cancel-at-period-end, Keygen suspend/reinstate, org seat sync |
| `customer.subscription.deleted` | Status → canceled, Keygen suspend                                          |
| `invoice.payment_succeeded`     | Expiry update, reactivation from `past_due`, Keygen reinstate              |
| `invoice.payment_failed`        | Status → `past_due`, attempt tracking, license suspension after 3 failures |
| `charge.dispute.created`        | Immediate license suspension, dispute alert email                          |
| `charge.dispute.closed`         | Reinstate if won; keep suspended + mark fraudulent if lost                 |

#### DynamoDB Fields Storing Stripe Identifiers

- `stripeCustomerId` — on customer records, org records, license metadata
- `stripeSubscriptionId` — on customer records, org records, license metadata
- GSI1PK = `STRIPE#<stripeCustomerId>` — reverse lookup index
- Cognito custom attribute: `custom:stripe_customer_id`

---

### Phase 1: LS Feasibility Assessment & Concept Mapping

**When:** Early Track A, after AP 8.6 (Stripe E2E validation of all 4 checkout paths) confirms current Stripe behavior
**Dependency:** AP 8.6 — Phase 1 should map *verified* Stripe behavior, not assumed behavior. Running AP 8.6 first (30 min) ensures the feasibility assessment is grounded in confirmed integration state.
**Effort:** ~45–60 minutes of active analysis; will require reading LS documentation and cross-referencing against existing Stripe integration code
**Deliverable:** `20260216_LEMON_SQUEEZY_MIGRATION_FEASIBILITY_ASSESSMENT.md` (or similar date-stamped name)

Phase 1 Will Investigate and Document:

#### 1.1 Stripe → LS Concept Mapping

A table mapping every Stripe concept currently in use to its LS equivalent, with notes on functional gaps or behavioral differences:

| Stripe Concept            | LS Equivalent                            | To Investigate                                                                                      |
| ------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Checkout Session (hosted) | LS Checkout (hosted overlay or redirect) | Does LS support the same redirect-and-return-URL pattern? How does the session object differ?       |
| Billing Portal (hosted)   | LS Customer Portal                       | Feature parity? Can customers update payment method, cancel, switch plans?                          |
| Webhook events (8 types)  | LS Webhook events                        | Which of our 8 Stripe events have direct LS equivalents? Are there LS events with no Stripe analog? |
| Products + Prices         | Products + Variants                      | How does LS model monthly/annual pricing? Seat-based quantity?                                      |
| Promotion Codes / Coupons | LS Discounts                             | Does LS support percentage-off coupons with the same semantics?                                     |
| Subscription statuses     | LS Subscription statuses                 | Map Stripe statuses (`active`, `past_due`, `canceled`, `trialing`) to LS equivalents                |
| Proration on seat changes | LS proration model                       | Does LS handle mid-cycle seat quantity changes with proration?                                      |
| Dispute handling          | LS dispute/chargeback flow               | Does LS even surface disputes to the merchant, or does MoR absorb them?                             |

#### 1.2 LS Webhook Event Mapping (Detailed)

For each of the 8 Stripe events we handle, identify:

- The LS webhook event name(s) that correspond
- The payload fields we currently extract from Stripe and their LS equivalents
- Any events where LS provides no equivalent (and what that means for our logic)
- Any LS events we don't currently handle that we should

#### 1.3 Architecture Impact Assessment

What changes vs. what stays the same:

**Expected to stay the same (no changes):**

- Keygen licensing (validate, activate, deactivate, heartbeat) — completely decoupled from payment
- DynamoDB table structure (aside from field naming, see §1.5)
- Email flows (SES transactional emails)
- Extension heartbeat and activation flow
- Cognito authentication (except possibly the custom attribute name)
- Portal UI layout and page structure (only the redirect targets and display copy change)

**Expected to change:**

- `src/lib/stripe.js` → new `src/lib/lemonsqueezy.js` (or equivalent)
- Webhook handler (`/api/webhooks/stripe/route.js`) → new handler for LS events
- Checkout API route (`/api/checkout/route.js`) — create LS checkout instead of Stripe checkout
- Checkout verify route (`/api/checkout/verify/route.js`) — verify via LS instead of Stripe
- Portal billing route — fetch billing info from LS
- Portal Stripe session route — redirect to LS Customer Portal instead
- Portal seats route — manage seats via LS API
- Account deletion — cancel subscription via LS API
- GDPR export — fetch invoice history from LS API
- Secrets management — LS API key(s) instead of Stripe keys
- Environment variables — LS price/variant IDs instead of Stripe price IDs
- Client-side copy ("Secure checkout via Stripe" → updated copy)
- Privacy Policy and FAQ text referencing Stripe
- npm packages (`stripe` → `@lemonsqueezy/lemonsqueezy.js`; remove `@stripe/stripe-js`)

#### 1.4 LS SDK and API Capabilities

Brief assessment of the LS JavaScript SDK (`@lemonsqueezy/lemonsqueezy.js`):

- Server-side capabilities: Does it cover checkout creation, webhook verification, subscription management, customer lookup?
- Is there a client-side SDK needed, or is it all server-side + redirect?
- Authentication model (API key? OAuth? Per-store key?)

#### 1.5 The DynamoDB Field Naming Decision (A-D1)

This is the single most consequential architectural decision in the migration. Three options:

| Option                                        | Approach                                                                           | Pros                                                                            | Cons                                                                                                                                                      |
| --------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **(a) Rename generically**                    | `stripeCustomerId` → `paymentCustomerId`, `STRIPE#` prefix → `PAY#`                | Clean, provider-agnostic, future-proof                                          | Requires DynamoDB data migration (backfill existing records), GSI key prefix change, Cognito attribute change, touches every file that reads these fields |
| **(b) Keep Stripe field names, store LS IDs** | `stripeCustomerId` stores LS customer ID; `STRIPE#<lsCustomerId>` stays as GSI key | Zero migration, zero schema changes, zero Cognito changes, fastest to implement | Misleading field names; confusing for anyone reading the code or DynamoDB directly                                                                        |
| **(c) Add parallel LS fields**                | Keep `stripeCustomerId` alongside new `lsCustomerId`; dual-read logic              | Supports gradual migration, could support both providers                        | Complexity explosion; dual-write/dual-read logic; not justified pre-launch with zero existing subscribers                                                 |

Phase 1 will present these options with a recommendation and request SWR's decision before Phase 2 proceeds. **Pre-launch context strongly favors option (b)**: there are zero existing subscribers, so no data migration is needed regardless, but option (b) also requires zero code changes to the DynamoDB layer, GSI definitions, or Cognito configuration. The field names would be misleading, but the codebase will have clear documentation explaining the naming lineage.

#### 1.6 Risk Assessment

What could go wrong, categorized by likelihood and impact:

- **Trivial:** checkout swap (redirect → redirect), client-side copy changes
- **Moderate:** webhook handler rewrite (different event names/payloads, but same handler structure)
- **Requires care:** DynamoDB field naming (whichever option chosen); subscription status mapping; proration/seat-change behavior differences
- **Unknown until investigated:** LS dispute handling model; LS sandbox → production transition; LS webhook reliability/retry semantics; LS Customer Portal feature set compared to Stripe's

#### 1.7 Effort Estimate Validation

Cross-reference the AP 8C estimates (8–10 hours for Phase C migration) against the actual surface area findings. Does 8–10 hours still hold, or does the ~37-file / ~15K-line surface area suggest more? Phase 1 will produce a revised estimate.

---

### Phase 2: Detailed LS Migration Specification

**When:** Generated after LS application is submitted (Track A Day ~4), during the ~1 week LS review wait window
**Effort:** ~2–3 hours of specification writing
**Deliverable:** `20260217_LEMON_SQUEEZY_MIGRATION_TECHNICAL_SPECIFICATION.md` (or actual date)
**Prerequisite:** Phase 1 complete, DynamoDB naming decision (A-D1) resolved by SWR

Phase 2 Will Produce:

#### 2.1 File-by-File Migration Guide

For every file in the ~37-file surface area, specify:

- What changes (with before/after code patterns where helpful)
- What stays the same
- Dependencies on other file changes
- Recommended execution order

Organized into change sets that can be executed by an AI agent in sequence:

| Change Set               | Files                                                                                | Description                                                           |
| ------------------------ | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| CS-1: Core library swap  | `stripe.js` → `lemonsqueezy.js`, `secrets.js`, `constants.js`                        | Replace Stripe SDK with LS SDK; update secret paths and env var names |
| CS-2: Webhook handler    | `webhooks/stripe/route.js` → `webhooks/lemonsqueezy/route.js`                        | New webhook handler with LS event mapping                             |
| CS-3: Checkout flow      | `checkout/route.js`, `checkout/verify/route.js`, `provision-license/route.js`        | LS checkout session creation, verification, provisioning              |
| CS-4: Portal routes      | `portal/stripe-session/route.js`, `portal/billing/route.js`, `portal/seats/route.js` | LS Customer Portal, billing info, seat management                     |
| CS-5: Account management | `settings/delete-account/route.js`, `settings/export/route.js`                       | LS subscription cancellation, LS invoice export                       |
| CS-6: Supporting libs    | `dynamodb.js`, `cognito.js`, `cognito-admin.js`, `auth.js`, `index.js`               | Field name updates (if option a), comment updates (if option b)       |
| CS-7: Client-side pages  | 7 page files                                                                         | Copy changes, redirect URL updates                                    |
| CS-8: Tests              | 9 test files + mock factory                                                          | New LS mock factory, updated assertions                               |
| CS-9: Infrastructure     | Secrets Manager, env vars, npm packages                                              | LS secrets, LS env vars, package.json updates                         |
| CS-10: Content           | Privacy Policy, FAQ, Pricing page                                                    | Text updates reflecting LS as payment processor                       |

#### 2.2 Webhook Event Mapping (Implementation-Level)

For each LS webhook event that maps to an existing Stripe handler:

- LS event name and payload schema
- Exact fields to extract and how they map to current handler variables
- Any behavioral differences requiring logic changes
- Error handling and retry semantics

#### 2.3 LS Product/Variant Configuration Guide

Step-by-step instructions for creating the LS equivalents of our current Stripe products:

- Individual Monthly ($15/mo)
- Individual Annual ($144/yr)
- Business Monthly ($25/seat/mo)
- Business Annual ($240/seat/yr)
- `EARLYADOPTER20` coupon equivalent

Including: how seat-based pricing works in LS, how proration is handled, and how the variant IDs map to our `STRIPE_PRICES` constants.

#### 2.4 Secrets and Environment Variable Transition Checklist

| Current (Stripe)                      | New (LS)                                   | Location         |
| ------------------------------------- | ------------------------------------------ | ---------------- |
| `STRIPE_SECRET_KEY`                   | LS API key                                 | Secrets Manager  |
| `STRIPE_WEBHOOK_SECRET`               | LS webhook signing secret                  | Secrets Manager  |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`  | Remove or replace (if LS needs client key) | Amplify env vars |
| `NEXT_PUBLIC_STRIPE_PRICE_*` (4 vars) | LS variant IDs                             | Amplify env vars |

#### 2.5 Test Adaptation Plan

- New `createLemonSqueezyMock()` factory in `dm/facade/helpers/`
- Mapping of existing Stripe mock methods to LS equivalents
- Which test files need full rewrites vs. find-and-replace updates
- E2E test updates for webhook contract tests (new event payloads)

#### 2.6 LS Sandbox Testing Protocol

How to validate the migration before going live:

- LS test mode configuration
- Sandbox webhook endpoint setup
- End-to-end test: checkout → webhook → license provisioning → portal
- All 4 plan/cycle combinations
- Seat change + proration verification
- Cancellation and payment failure flows

#### 2.7 Cutover Checklist

Step-by-step instructions for the final switch:

- LS sandbox → live mode transition
- DNS/webhook endpoint changes
- Stripe decommissioning (archive code, remove secrets, remove env vars)
- Rollback plan (if LS integration fails in production, revert to Stripe)

#### 2.8 Post-Migration Security Spot-Check

Because AP 2b (Comprehensive Security Audit) runs during the LS wait window — *before* migration code changes land — Phase 2 must include a scoped security review of all files modified during AP 8C. This is not a full re-audit; it is a targeted review ensuring that migration-introduced changes don't introduce regressions in areas AP 2b already cleared.

Scope (mandatory, regardless of A-D1 outcome):

- Webhook signature validation: LS signing secret correctly verified (replaces Stripe `constructEvent`)
- Checkout session creation: no secrets leaked to client, proper error handling
- API route authorization: all protected routes still enforce auth after SDK swap
- Environment variable/secret hygiene: old Stripe secrets removed, LS secrets properly sourced from Secrets Manager
- `npm audit` re-run after `@lemonsqueezy/lemonsqueezy.js` added and `stripe` removed

Additional scope if A-D1 = option (a) or (c) (schema changes):

- DynamoDB field rename correctness: no orphaned references to old field names
- GSI key prefix changes: verify all queries updated
- Cognito custom attribute migration: confirm claim mapping still works in auth flow

This spot-check is the final gate before AP 4 (production deployment). It ensures that the security posture validated by AP 2b is preserved through the migration.

---

### Key Architectural Insight: Licensing Is Decoupled

The single most important fact about this migration is that **the licensing stack is completely independent of the payment stack.**

```
PAYMENT LAYER (what changes)          LICENSING LAYER (what stays)
─────────────────────────────         ──────────────────────────────
Stripe / LS collects payment          Keygen validates/activates licenses
    │                                      ▲
    ▼                                      │
Webhook fires on payment event        License created post-payment
    │                                      ▲
    ▼                                      │
Our webhook handler processes ───────► Keygen API: create license
    │                                      │
    ▼                                      ▼
DynamoDB stores customer data         Extension heartbeat → our API
                                           │
                                           ▼
                                      /api/license/validate (Keygen)
                                      /api/license/activate (Keygen)
                                      /api/license/heartbeat (Keygen)
```

The extension talks to `api.hic-ai.com`, which talks to Keygen. The extension never knows or cares who collected the payment. The webhook handler is the only bridge between the payment layer and the licensing layer. Everything downstream of "license created in Keygen + customer record created in DynamoDB" is payment-provider-agnostic.

This means the migration surface is actually smaller than the raw file count suggests. Many of the ~37 files only reference Stripe _data_ (reading `stripeCustomerId` from DynamoDB) rather than calling the Stripe _API_. The true integration surface — files that import and call the Stripe SDK — is ~7 API routes + 1 core library + 2 scripts = 10 files.

---

### The DynamoDB Field Naming Question

This is flagged as a standalone section because it's the only decision in the migration that has architectural consequences beyond the payment swap itself. It affects:

- DynamoDB table schema (field names, GSI key prefixes)
- Cognito custom attributes (`custom:stripe_customer_id`)
- Every API route that reads/writes customer or org records
- Business plans that use `stripeCustomerId` as `orgId`

Phase 1 will present the three options (generic rename, keep names, parallel fields) with analysis. **The decision must be made by SWR before Phase 2 can proceed**, because the file-by-file migration guide differs substantially depending on the choice.

**Preliminary recommendation (to be validated in Phase 1):** Option (b) — keep existing field names, store LS IDs in them. Rationale: zero existing subscribers pre-launch, zero DynamoDB migration needed, zero Cognito changes, fastest path to LS integration. The naming confusion is documented and the codebase can be renamed at leisure post-launch.

**Security audit interaction:** A-D1's resolution affects the scope of AP 2b (Comprehensive Security Audit). AP 2b is scheduled to run during the LS wait window (Days 4–10), *before* AP 8C migration executes (Day ~10). This means AP 2b covers the pre-migration codebase. Whichever option SWR chooses for A-D1, the post-migration code changes (~10 files) must receive a dedicated security spot-check — see Phase 2 section 2.8 below. If A-D1 = option (a) or (c) (schema changes), the spot-check scope expands to include DynamoDB field/GSI changes and Cognito attribute updates.

---

## Path B: Paddle (Parallel Backup)

**Status:** Application not yet submitted
**Effort (pre-application):** ~1–2 hours | **Effort (post-approval integration):** TBD — comprehensive plan to be built out during review wait window
**When:** Submit application simultaneously with LS (Track A Day ~4)

### Why Paddle

Paddle is the second-largest MoR for software and SaaS products. Like LS, Paddle acts as the seller of record, handles global tax compliance, and remits net revenue minus their fee. Key characteristics:

- **Same MoR model as LS** — Paddle collects payment, handles sales tax / VAT / GST globally, remits net to SWR
- **Different API, same architecture** — the architectural insight from Path A (§ Key Architectural Insight) applies identically. The licensing stack (Keygen) is completely independent of the payment layer. Only the webhook handler and checkout flow change.
- **Major customer base** — Paddle is used by thousands of software companies; MoR approval criteria may differ from LS and could be more favorable
- **Separate application** — no dependency on LS outcome; the applications are entirely independent

### Pre-Application Checklist

The same prerequisites that strengthen the LS application also strengthen the Paddle application:

- [ ] Website live and professional (AP 1 + AP 4)
- [ ] Social media presence active (AP 12 Phase 2)
- [ ] Product is real, functional, and demonstrable
- [ ] Company is incorporated (HIC AI, Inc. — already done)
- [ ] Bank account ready (Mercury — already established)

### Planning Philosophy: After Application, Not Before

Do **not** invest in detailed Paddle migration planning before applying. Reasons:

1. The application itself takes ~1–2 hours (account setup, business verification, product description). That effort is justified regardless of outcome.
2. If Paddle approves and LS also approves, the Paddle planning is wasted work.
3. If Paddle approves and LS rejects, the Paddle migration plan can be built during the remaining review window or immediately after approval — following the same structure as the LS Phase 1/Phase 2 approach.
4. If both reject, neither plan matters.

**The right time for detailed Paddle planning is after we know which MoR approved.**

### Post-Approval: What a Paddle Plan Would Contain

If Paddle approves (and is the selected MoR), a comprehensive migration plan will be drafted covering:

- Paddle API → Stripe concept mapping (checkout, billing portal, webhooks, subscriptions)
- Paddle SDK capabilities assessment (`@paddle/paddle-node-sdk`)
- Webhook event mapping (Paddle → our 8 existing handler actions)
- Product/price configuration in Paddle dashboard
- DynamoDB field naming decision (same A-D1 question applies)
- File-by-file migration guide (same ~10 true integration files)
- Test adaptation plan
- Cutover checklist and post-migration security spot-check

This plan would mirror the LS Phase 1/Phase 2 structure but targeting Paddle's API surface. **It does not need to exist before the application is submitted.**

### Paddle vs. LS: Key Differences to Research (Post-Application)

| Dimension | LS | Paddle | To Investigate |
|-----------|-----|--------|----------------|
| SDK | `@lemonsqueezy/lemonsqueezy.js` | `@paddle/paddle-node-sdk` | API parity, server-only vs. client+server |
| Hosted checkout | Overlay or redirect | Overlay (Paddle.js) | Customization, redirect-URL patterns |
| Billing portal | Customer Portal | Customer Portal | Feature parity with Stripe |
| Webhook verification | Signing secret | Webhook signature (H256) | Implementation differences |
| Seat-based pricing | Quantity on variant | Quantity on subscription | Proration model, mid-cycle changes |
| Dispute handling | TBD | MoR absorbs chargebacks | Verify: does Paddle shield merchant from disputes? |

> **Note:** This comparison table is intentionally preliminary. Full research happens during the review wait window, only if Paddle is the MoR that gets approved.

---

## Path C: Stripe Direct (Emergency Fallback)

**Status:** Existing integration in test mode; live mode available immediately
**Effort:** 3–4 hours to switch to live mode
**When:** Only if both LS and Paddle reject

### The Problem: Global Tax Compliance Without an MoR

SWR has characterized this option as a "keys in the ocean" problem — a question that cannot be meaningfully answered because the premises make it unreasonable:

> *"How do I throw my keys in the ocean and then come back the next day and find them?" The answer is: Don't throw your keys in the ocean, at least not if you ever want to see them again.*

Selling globally through Stripe without an MoR means SWR personally bears tax compliance obligations in every jurisdiction where a customer purchases. The practical reality:

- **US alone:** 50 state tax jurisdictions, plus municipalities with their own sales tax regimes (New York City, Chicago, San Francisco, and others). Each has different thresholds, rates, exemptions, and filing requirements for SaaS / digital goods.
- **International:** The EU (27 member states each with VAT), UK (separate VAT post-Brexit), Canada (GST/HST/PST varying by province), Australia (GST), Japan (consumption tax), India (GST), and dozens more — potentially 100+ jurisdictions from Day 1 of a global launch.
- **Nexus and registration thresholds:** Many jurisdictions require registration and collection only after exceeding a threshold (e.g., €10K cross-border B2C in EU for VAT, or state-specific thresholds in the US). But tracking and monitoring these thresholds across 100+ jurisdictions is itself a full-time compliance operation.
- **Filing and remittance:** Even where collected, each jurisdiction has its own filing cadence (monthly, quarterly, annually), its own forms, its own portals, and its own penalties for non-compliance.

This is not feasibly managed by a solo founder. It requires either an MoR (which handles it all) or an army of tax accountants and engineers.

### Stripe Tax: A Partial Solution (Research Required)

Stripe offers "Stripe Tax" as an add-on service that automatically calculates, collects, and reports sales tax, VAT, and GST. **GC has not researched whether Stripe Tax provides a viable path for a solo indie developer to sell globally without a dedicated MoR.** Key questions that would need to be answered:

- Does Stripe Tax handle *remittance* (actually filing and paying the taxes), or only *calculation and collection* (leaving SWR to file and remit in each jurisdiction)?
- What jurisdictions does Stripe Tax support? Is it comprehensive enough for global sales?
- What is the per-transaction cost? Is it economically viable at low volume?
- Does Stripe Tax handle registration obligations, or does SWR still need to register in each jurisdiction independently?
- Are there indie developer precedents — solo founders using Stripe Tax to sell globally — or is it primarily designed for companies with dedicated finance teams?

> **This research is explicitly deferred.** It should only be conducted if both LS and Paddle reject, making Stripe direct the only remaining option. Investing time into this research before knowing the MoR application outcomes would be premature.

### If Stripe Direct Becomes Necessary: Essential Parameters

If — and only if — both MoR applications are rejected, the following decisions must be made quickly:

| Decision | Options | Notes |
|----------|---------|-------|
| **Geographic restrictions** | (a) US-only sales initially, (b) US + select countries, (c) Full global (accept compliance risk) | Restricting to US-only simplifies the problem to ~50 states but does not eliminate it. Even US-only requires a state-by-state nexus analysis for SaaS. |
| **Stripe Tax adoption** | (a) Enable Stripe Tax (if it handles remittance), (b) Enable Stripe Tax for calculation only + manual remittance, (c) No tax collection (accept legal risk) | Requires the research described above. |
| **Volume and risk tolerance** | At very low initial volume (<50 customers), the practical enforcement risk is low but the legal exposure exists. Document the risk explicitly. | This is a legal judgment call for SWR as attorney. |
| **Timeline to MoR reapplication** | Set a hard date (e.g., 30 days post-launch) to reapply with traction data. Stripe direct is a bridge, not a destination. | The goal is to minimize the window of exposure, not to make Stripe direct permanent. |

### What Stripe Live Mode Entails (Technical)

The Stripe integration already exists and works in test mode. Going live requires:

1. Complete business profile in Stripe Dashboard (SWR already done)
2. Swap test API keys for live API keys in Secrets Manager (~15 min)
3. Create products and prices in live mode to match test-mode configuration (~30 min)
4. Update webhook endpoints to live-mode equivalents (~15 min)
5. Test all 4 checkout paths (Individual Monthly/Annual, Business Monthly/Annual) with real payment method (~1h)
6. Verify webhook → Keygen → DynamoDB flow end-to-end (~30 min)
7. Confirm SWR's dogfooding subscription works (P8 verification) (~15 min)

**Total: ~3–4 hours.** This is dramatically simpler than LS or Paddle migration because the code already exists — it's a configuration change, not a code change.

### Bottom Line on Stripe Direct

Stripe direct is a lifeboat, not a yacht. It gets HIC AI to market if both MoR applications fail, but it does so with known and significant tax compliance limitations. The planning posture is:

1. **Do not invest meaningful planning time into Stripe Tax or global tax compliance research before MoR application outcomes are known.** The probability of needing this path is low (dual-application hedging).
2. **If needed, restrict sales geographically** as a temporary measure while reapplying to MoR platforms with traction data.
3. **Treat Stripe direct as a bridge** — never the final state. Set a hard reapplication date.
4. **The technical work is trivial** (3–4 hours). The *compliance* work is the unsolvable part, and no amount of pre-planning changes that reality.

---

## Decision Matrix

| Scenario | Path | Action | Tax Compliance | Risk Level |
|----------|------|--------|----------------|------------|
| LS approves (regardless of Paddle) | **A: LS** | Execute LS migration (Phase 2 spec, ~8–10h) | LS handles everything | ✅ None |
| LS rejects, Paddle approves | **B: Paddle** | Build + execute Paddle migration plan (~10–14h incl. planning) | Paddle handles everything | ✅ None |
| Both approve | **A: LS** (preferred) | Use LS; Paddle as future backup | LS handles everything | ✅ None |
| Both reject | **C: Stripe** | Go live with Stripe direct (~3–4h); restrict geography; research Stripe Tax; reapply to MoRs with traction data | SWR bears compliance | ⚠️ Significant |

**Priority order is unambiguous:** LS > Paddle > Stripe. The dual-application strategy exists specifically to minimize the probability of reaching Path C.

---

## Timeline Integration

This multi-path approach integrates into the existing Track A / Track B structure:

```
Track A Timeline
────────────────
Early Track A (Day 1–2):
  ├── AP 0: Phase 0 quick wins (~3h)
  ├── AP 8.6: Verify 4 Stripe test-mode checkout paths (30 min)
  │   └── Confirms actual Stripe behavior before LS/Paddle comparison
  └── LS Phase 1: Feasibility Assessment (~45-60 min, after AP 8.6)
      └── DynamoDB naming decision (A-D1) → SWR decides

Day 1–3: Track A work (AP 12 Phase 2, AP 1, AP 5, AP 2a)

Day ~4: Submit MoR applications (LS + Paddle simultaneously)
  └── LS Phase 2 begins: Detailed Migration Spec (~2–3h)
  └── Paddle concept mapping begins (if time permits, ~1h)
  └── Both written during MoR wait, alongside Track B work

Day ~4–10: MoR review period (~1 week)
  └── LS Phase 2 completed and ready
  └── Paddle preliminary research completed
  └── Track B work proceeds in parallel
  └── Private disclosures (AP 13) proceed in parallel

Day ~10: MoR decision(s) arrive
  ├── If LS APPROVED → Execute LS Phase 2 spec (AP 8C, ~8–10h)
  ├── If LS REJECTED + Paddle APPROVED → Build + execute Paddle plan (~10–14h)
  ├── If LS REJECTED + Paddle PENDING → Wait for Paddle; continue Track B
  └── If BOTH REJECTED → Execute Stripe live mode (~3–4h); restrict geography;
      reapply with traction data within 30 days

Day ~11–14: Payment integration complete → AP 4 (production deployment)
```

**Critical insight:** The LS Phase 1 feasibility assessment depends on AP 8.6 (Stripe E2E validation) because it must compare *verified* Stripe behavior against LS capabilities — not assumed behavior. AP 8.6 (30 min) → LS Phase 1 (45–60 min) is a natural early-Track-A sequence. LS Phase 1 then introduces decision A-D1 (DynamoDB field naming), which should be resolved before LS Phase 2 proceeds — ideally during the same decision session in which SWR resolves B-D1–B-D8 for Track B.

**Paddle timeline note:** Paddle and LS may not respond on the same day. The decision matrix above handles staggered responses — if one approves before the other responds, begin execution with the approved MoR. If the second later also approves, it becomes a backup option for the future.

---

## Next Steps

### Pre-Application (Now → Day ~4)

1. ✅ **AP 0 item 0.10** — MoR feasibility assessment (preliminary — what does the application require, accounts to create, information to gather)
2. **AP 8.6** — Verify all 4 Stripe test-mode checkout paths (30 min). This validates current behavior before any migration planning.
3. **LS Phase 1** — Feasibility assessment & concept mapping (~45–60 min). Produces the Stripe → LS concept mapping, risk assessment, and surfaces A-D1 decision.
4. **A-D1 decision** — DynamoDB field naming, to be resolved by SWR before LS Phase 2 proceeds.
5. **Create Paddle account** — Sign up, begin business verification process (~30 min)

### Post-Application (Day ~4 → Day ~10, during MoR review wait)

6. **LS Phase 2 document** — Detailed file-by-file migration specification (~2–3h). Generated during the wait window. This is the critical deliverable: if LS approves, execution begins immediately from this spec.
7. **Paddle preliminary research** — Paddle API review, concept mapping, SDK assessment (~1h). Only if time permits after LS Phase 2. Not a full migration spec — just enough to accelerate planning if Paddle becomes the selected path.
8. **Stripe Tax research** — Only if early signals suggest both MoR applications may be problematic. Otherwise, explicitly deferred.

### Post-Decision (Day ~10+)

9. **Execute the approved path** per the Decision Matrix above.
10. **Post-migration security spot-check** — Targeted review of all files modified during payment migration (see LS Phase 2 §2.8).

---

## Document History

| Date | Author | Changes |
|------|--------|--------|
| 2026-02-16 | GC | Original document: "Proposed Plans for Lemon Squeezy Migration" — LS-specific two-phase migration analysis |
| 2026-02-18 | GC | Promoted to AP 8: MoR Strategy & Payment Integration. Added Strategic Overview, Path B (Paddle parallel backup), Path C (Stripe emergency fallback with "keys in the ocean" framing), Decision Matrix, updated Timeline for dual-application strategy, revised Next Steps with post-application planning philosophy. Preserved full LS analysis as Path A. |
