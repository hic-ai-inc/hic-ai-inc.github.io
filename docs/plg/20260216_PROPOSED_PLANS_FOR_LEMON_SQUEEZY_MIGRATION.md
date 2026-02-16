# Proposed Plans for Lemon Squeezy Migration

**Date:** February 16, 2026
**Author:** General Counsel
**Purpose:** Outlines the two-phase documentation and decision-making approach for potentially migrating from Stripe to Lemon Squeezy (LS) as Merchant of Record (MoR) prior to launch. This is a plan _for_ the planning documents, not the plans themselves.
**Context:** Companion to `20260216_PRE_LAUNCH_STATUS_ASSESSMENT_AND_ACTION_PLANS.md` (AP 8) and `20260216_ACTION_PLAN_DEPENDENCY_MAP.md`.

---

## Table of Contents

1. [Strategic Context](#strategic-context)
2. [Why Two Phases](#why-two-phases)
3. [Current Stripe Integration Surface Area](#current-stripe-integration-surface-area)
4. [Phase 1: Feasibility Assessment & Concept Mapping](#phase-1-feasibility-assessment--concept-mapping)
5. [Phase 2: Detailed Technical Migration Specification](#phase-2-detailed-technical-migration-specification)
6. [Key Architectural Insight: Licensing Is Decoupled](#key-architectural-insight-licensing-is-decoupled)
7. [The DynamoDB Field Naming Question](#the-dynamodb-field-naming-question)
8. [Contingency: If LS Rejects](#contingency-if-ls-rejects)
9. [Timeline Integration](#timeline-integration)

---

## Strategic Context

### The MoR Imperative

Without a Merchant of Record, SWR personally bears global tax compliance obligations — calculating, collecting, remitting, and filing sales tax / VAT / GST in every jurisdiction where a customer purchases a license. This is operationally unworkable for a solo founder at any scale:

- **10 customers in 10 countries** = 10 separate tax compliance regimes, with insufficient revenue to justify professional tax help
- **10,000 customers overnight (viral scenario)** = potentially 100+ jurisdictions with immediate compliance exposure

Lemon Squeezy acts as MoR: they are the seller of record, collect the payment, handle all tax obligations globally, and remit net revenue to HIC AI minus their fee. SWR is willing to delay launch to have LS integrated from Day 1 to avoid this exposure entirely.

### Prior History with LS

- **January 30, 2026:** LS declined initial MoR application, citing lack of "website and social media presence"
- **Invitation to reapply:** LS explicitly invited reapplication once those were in place
- **Current status:** Website is live at `staging.hic-ai.com`; social media accounts to be created as part of Track A (AP 8.3)

### Uncertainty Profile

LS approval is genuinely uncertain. The previous rejection was clear about what was missing (website + social), and both will exist before reapplication. But the ~1 week review timeline and binary approve/reject outcome mean we must plan for both paths without over-investing in either.

---

## Why Two Phases

The two-phase approach balances planning rigor against the risk of wasted effort on an uncertain outcome.

| Phase       | Timing                                       | Cost       | Value If LS Approves                                                                                      | Value If LS Rejects                                                                   |
| ----------- | -------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Phase 1** | Early Track A (after AP 8.6 Stripe validation) | ~45–60 min | Confirms viability; surfaces critical decisions (DynamoDB naming); unblocks fast execution after approval | Clarifies architecture; the concept mapping and risk assessment are useful regardless |
| **Phase 2** | During LS wait window (after Track A Day ~4) | ~2–3 hours | Enables autonomous AI-agent execution of migration immediately upon approval                              | Wasted effort (but used what would otherwise be dead time)                            |

**Key scheduling insight:** Phase 2 is written during the LS wait window (~1 week), which is otherwise dead time for Track A. Writing it then is "free" from a critical-path perspective — it doesn't delay anything. But writing it _now_, before Track A even starts, would pre-invest 2–3 hours on a genuinely uncertain outcome with no scheduling benefit.

**The alternative of writing Phase 2 _after_ LS approval** is rejected because approval triggers a time-critical execution sprint. Every hour spent planning after approval is an hour of execution delayed. Having the spec ready means "LS approved → start coding immediately."

---

## Current Stripe Integration Surface Area

A preliminary inventory of the Stripe integration was conducted on February 16. This establishes the scope of what a migration would touch.

### Summary Metrics

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

### Stripe SDK Functions in Active Use

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

### Webhook Events Handled (8 total)

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

### DynamoDB Fields Storing Stripe Identifiers

- `stripeCustomerId` — on customer records, org records, license metadata
- `stripeSubscriptionId` — on customer records, org records, license metadata
- GSI1PK = `STRIPE#<stripeCustomerId>` — reverse lookup index
- Cognito custom attribute: `custom:stripe_customer_id`

---

## Phase 1: Feasibility Assessment & Concept Mapping

**When:** Early Track A, after AP 8.6 (Stripe E2E validation of all 4 checkout paths) confirms current Stripe behavior
**Dependency:** AP 8.6 — Phase 1 should map *verified* Stripe behavior, not assumed behavior. Running AP 8.6 first (30 min) ensures the feasibility assessment is grounded in confirmed integration state.
**Effort:** ~45–60 minutes of active analysis; will require reading LS documentation and cross-referencing against existing Stripe integration code
**Deliverable:** `20260216_LEMON_SQUEEZY_MIGRATION_FEASIBILITY_ASSESSMENT.md` (or similar date-stamped name)

### Phase 1 Will Investigate and Document

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

#### 1.2 Webhook Event Mapping (Detailed)

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

## Phase 2: Detailed Technical Migration Specification

**When:** Generated after LS application is submitted (Track A Day ~4), during the ~1 week LS review wait window
**Effort:** ~2–3 hours of specification writing
**Deliverable:** `20260217_LEMON_SQUEEZY_MIGRATION_TECHNICAL_SPECIFICATION.md` (or actual date)
**Prerequisite:** Phase 1 complete, DynamoDB naming decision (A-D1) resolved by SWR

### Phase 2 Will Produce

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

## Key Architectural Insight: Licensing Is Decoupled

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

## The DynamoDB Field Naming Question

This is flagged as a standalone section because it's the only decision in the migration that has architectural consequences beyond the payment swap itself. It affects:

- DynamoDB table schema (field names, GSI key prefixes)
- Cognito custom attributes (`custom:stripe_customer_id`)
- Every API route that reads/writes customer or org records
- Business plans that use `stripeCustomerId` as `orgId`

Phase 1 will present the three options (generic rename, keep names, parallel fields) with analysis. **The decision must be made by SWR before Phase 2 can proceed**, because the file-by-file migration guide differs substantially depending on the choice.

**Preliminary recommendation (to be validated in Phase 1):** Option (b) — keep existing field names, store LS IDs in them. Rationale: zero existing subscribers pre-launch, zero DynamoDB migration needed, zero Cognito changes, fastest path to LS integration. The naming confusion is documented and the codebase can be renamed at leisure post-launch.

**Security audit interaction:** A-D1's resolution affects the scope of AP 2b (Comprehensive Security Audit). AP 2b is scheduled to run during the LS wait window (Days 4–10), *before* AP 8C migration executes (Day ~10). This means AP 2b covers the pre-migration codebase. Whichever option SWR chooses for A-D1, the post-migration code changes (~10 files) must receive a dedicated security spot-check — see Phase 2 section 2.8 below. If A-D1 = option (a) or (c) (schema changes), the spot-check scope expands to include DynamoDB field/GSI changes and Cognito attribute updates.

---

## Contingency: If LS Rejects

If LS declines the reapplication, the fallback is AP 8D (Stripe live mode), which is already outlined in the Action Plans document. Key points:

- **Effort:** 3–4 hours (vs. 8–10 for LS migration)
- **What happens:** Switch Stripe from test to live mode, create live-mode products/prices, update webhook endpoints, test all 4 checkout paths
- **Tax implications:** SWR bears global tax compliance obligations directly until an MoR is eventually secured (either LS reapplication with traction data, or Paddle as an alternative)
- **Phase 2 effort is lost:** The ~2–3 hours spent writing the LS migration spec during the wait window would be sunk cost. This is acceptable because the wait window is otherwise dead time for Track A.

If LS rejects, SWR should also consider:

- **Paddle** as an alternative MoR (separate account/onboarding, different API, but same MoR concept)
- **Re-applying to LS** post-launch with demonstrated traction (paying customers, active subscriptions)
- **Launching with Stripe + manual tax compliance** for the first ~30 days while pursuing an MoR, accepting the risk for a limited period

---

## Timeline Integration

This two-phase approach integrates into the existing Track A / Track B structure:

```
Track A Timeline
────────────────
Early Track A (Day 1–2):
  ├── AP 8.6: Verify 4 Stripe test-mode checkout paths (30 min)
  │   └── Confirms actual Stripe behavior before LS comparison
  └── Phase 1: Feasibility Assessment (~45-60 min, after AP 8.6)
      └── DynamoDB naming decision (A-D1) → SWR decides

Day 1–3: Track A work (Plausible, Legal, UX, Docs, Security)

Day ~4: Submit LS application (AP 8A)
  └── Phase 2 begins: Detailed Migration Spec (~2–3h)
      Written during LS wait, alongside Track B work

Day ~4–10: LS review period
  └── Phase 2 completed and ready
  └── Track B work proceeds in parallel
  └── Private disclosures (AP 13) proceed in parallel

Day ~10: LS decision arrives
  ├── If APPROVED → Execute Phase 2 spec immediately (AP 8C, ~8–10h)
  └── If REJECTED → Execute AP 8D Stripe live mode (~3–4h)

Day ~11–12: Payment integration complete → AP 4 (production deployment)
```

**Critical insight:** Phase 1 depends on AP 8.6 (Stripe E2E validation) because the feasibility assessment must compare *verified* Stripe behavior against LS capabilities — not assumed behavior. AP 8.6 (30 min) → Phase 1 (45–60 min) is a natural early-Track-A sequence. Phase 1 then introduces decision A-D1 (DynamoDB field naming), which should be resolved before Phase 2 proceeds — ideally during the same decision session in which SWR resolves B-D1–B-D8 for Track B.

---

## Next Steps

1. **Phase 1 document** will be generated in a dedicated session, involving close investigation of LS documentation, API reference, SDK capabilities, webhook event catalog, and cross-referencing against the existing Stripe integration code
2. **A-D1 decision** (DynamoDB field naming) will be presented to SWR for resolution
3. **Phase 2 document** will be generated after LS application submission, during the LS wait window
