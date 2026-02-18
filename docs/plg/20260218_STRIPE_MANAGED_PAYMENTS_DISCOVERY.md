# Stripe Managed Payments Discovery

**Date:** February 18, 2026
**Author:** GC (GitHub Copilot), incorporating research from GPT-5.2 Thinking
**Status:** Discovery complete — attorney review of preview terms required before activation
**Purpose:** Documents the discovery that Stripe Managed Payments (global MoR) is available on our existing Stripe account, what the service entails, its constraints, and the downstream impact on pre-launch planning.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [What Stripe Managed Payments Is](#2-what-stripe-managed-payments-is)
3. [How We Discovered It](#3-how-we-discovered-it)
4. [Current Status on Our Account](#4-current-status-on-our-account)
5. [Eligibility Confirmation](#5-eligibility-confirmation)
6. [Integration Requirements](#6-integration-requirements)
7. [Terms & Constraints Requiring Attorney Review](#7-terms--constraints-requiring-attorney-review)
8. [Impact on Pre-Launch Plans](#8-impact-on-pre-launch-plans)
9. [Revised MoR Strategy](#9-revised-mor-strategy)
10. [Open Questions](#10-open-questions)
11. [Sources](#11-sources)

---

## 1. Executive Summary

On February 18, 2026, SWR discovered that Stripe now offers **Stripe Managed Payments** — a global Merchant of Record (MoR) service. This service is operated by **Lemon Squeezy LLC ("SMP")**, a Stripe affiliate acquired in 2024. Upon checking the Stripe Dashboard, we confirmed that Managed Payments is **available and active on our existing Stripe account** — no separate application, KYB review, or approval process was required beyond our existing Stripe verification.

**This discovery potentially eliminates the core constraint that shaped our entire pre-launch planning sprint:** the need to migrate from Stripe to a different payment vendor (LS or Paddle) that offers MoR services. With Managed Payments, we may be able to add MoR to our existing Stripe integration through parameter-level changes rather than a multi-day migration.

**Key facts:**

- Stripe Managed Payments is in **Preview** status (not GA)
- The legal entity operating the service is **Lemon Squeezy LLC**
- Our existing Stripe products and tax category (downloadable software, business use) were automatically recognized
- Integration requires adding one parameter (`managed_payments[enabled]=true`) + a preview version header + removing ~16 parameters from Checkout Session creation
- Preview terms contain several provisions that require SWR's attorney review before activation
- SWR has saved progress at Step 3 of Stripe Managed Payment's setup flow

---

## 2. What Stripe Managed Payments Is

Stripe Managed Payments is Stripe's global MoR offering. When enabled:

- **Stripe (via Link/Lemon Squeezy) becomes the legal seller** for transactions
- Stripe handles **global indirect tax compliance** (VAT, GST, sales tax) across all supported jurisdictions
- Stripe provides **transaction-level customer support** via Link
- Stripe handles **fraud prevention and dispute response**
- Customer-facing branding is **"Sold through Link"**

The service is provided by **Stripe's affiliate, Lemon Squeezy LLC ("SMP")**. Stripe acquired Lemon Squeezy in 2024. The infrastructure that powered standalone Lemon Squeezy MoR services has been integrated into Stripe's platform as "Managed Payments."

**What this means practically:** This is LS's MoR capability, repackaged and accessible directly from within Stripe's existing infrastructure. The approval and integration surfaces are different from standalone LS, but the underlying tax compliance and MoR operations appear to be the same entity.

---

## 3. How We Discovered It

- **Prior state:** As of our Feb 16–18 planning sprint, SWR's understanding was that Stripe did not offer a publicly available global MoR solution. The last check indicated it was in private/preview mode.
- **Feb 18 morning:** While GC was assembling the Dependency Map v2, SWR researched whether Stripe's MoR offering had become available. SWR asked GPT-5.2 to thoroughly research Stripe Managed Payments.
- **GPT-5.2 research confirmed:** The service exists, is operational (though labeled Preview), and is documented in Stripe's public docs.
- **SWR dashboard check:** SWR navigated to Stripe Dashboard → Settings → Managed Payments and confirmed the feature is available on our account. Stripe automatically recognized our existing products and tax categories.

---

## 4. Current Status on Our Account

| Aspect                     | Status                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------- |
| **Dashboard availability** | ✅ Available — Settings → Managed Payments accessible                                 |
| **Product recognition**    | ✅ Existing products detected with tax category (downloadable software, business use) |
| **Setup progress**         | Saved at Step 3 of Stripe's guided setup flow                                         |
| **Terms accepted**         | ❌ Not yet — requires attorney review first                                           |
| **Test transaction**       | ❌ Not yet attempted                                                                  |
| **Live activation**        | ❌ Not yet — pending attorney review and testing                                      |

---

## 5. Eligibility Confirmation

GPT-5.2's research confirmed Mouse meets all stated eligibility criteria:

| Criterion                          | Mouse Status                                               |
| ---------------------------------- | ---------------------------------------------------------- |
| **Supported business location**    | ✅ US-based (Delaware C-corp)                              |
| **Digital product**                | ✅ VS Code extension + license/subscription                |
| **Direct sales** (not marketplace) | ✅ Selling directly to end users                           |
| **Rights/licenses held**           | ✅ SWR is sole owner                                       |
| **Eligible tax code**              | ✅ Downloadable software (business use) — already assigned |
| **Uses Stripe Checkout**           | ✅ Already our checkout integration                        |

**No eligibility issues identified.**

---

## 6. Integration Requirements

### What Changes in Our Code

Based on Stripe's documentation and GPT-5.2's research:

#### Add to Checkout Session creation:

```
managed_payments[enabled] = true
```

Plus a preview version header:

```
Stripe-Version: 2025-03-31.basil; managed_payments_preview=v1
```

#### Remove from Checkout Session creation (~16 parameters):

The following parameters are controlled by Stripe/Link when acting as MoR and must be removed:

- `automatic_tax`
- `tax_id_collection`
- `subscription_data.default_tax_rates`
- `payment_method_collection`
- `payment_method_configuration`
- `payment_method_options`
- `payment_method_types`
- `saved_payment_method_options`
- `customer_update[name]`
- Plus ~7 additional parameters (statement descriptors, receipt_email, invoice creation controls, shipping collection, Connect transfers, etc.)

#### What stays the same:

- Products and Prices (already created)
- Tax codes (already assigned)
- Webhook handlers (events still fire)
- Customer/Subscription objects (still created in Stripe)
- Keygen license provisioning (unchanged — triggered by webhooks)
- DynamoDB record keeping (unchanged — triggered by webhooks)
- Customer portal (Link handles some management, but our portal still works)

### Estimated Integration Effort

| Task                                                                           | Effort           |
| ------------------------------------------------------------------------------ | ---------------- |
| Identify which of the ~16 forbidden parameters our code actually uses          | 30 min           |
| Remove/guard forbidden parameters in Checkout Session creation                 | 1–2 hours        |
| Add `managed_payments[enabled]` + version header                               | 15 min           |
| Test all 4 checkout paths (Individual Monthly/Annual, Business Monthly/Annual) | 1 hour           |
| Verify webhook flow + license provisioning still works                         | 30 min           |
| Verify customer portal / subscription management                               | 30 min           |
| **Total**                                                                      | **~3–4.5 hours** |

**Compare to migration effort:**

- LS migration (AP 8 Path A): ~8–10 hours
- Paddle migration (AP 8 Path B): ~10–14 hours
- Stripe Managed Payments: ~3–4.5 hours (parameter changes, not a migration)

---

## 7. Terms & Constraints Requiring Attorney Review

The following provisions from the Stripe Managed Payments Service Terms (labeled "Preview") require SWR's review as attorney before activation. Each is summarized with the concern noted.

### 7.1 — Preview Status

The service is labeled "Preview Service" with Stripe reserving the right to change features and terms without notice during preview.

**Concern:** Product viability risk. If Stripe discontinues or materially changes the preview, we would need to migrate to an alternative MoR (LS standalone, Paddle, or self-managed tax compliance). However, our existing Stripe Payments integration would still function — we'd just lose the MoR layer.

**Mitigation:** The underlying payment infrastructure is standard Stripe. The MoR is additive. Removing it reverts to self-managed tax compliance, not payment failure.

### 7.2 — 60-Day Refund Discretion

Lemon Squeezy (SMP) may issue refunds within 60 days regardless of the seller's refund policy. The seller bears the economic cost of these refunds.

**Concern:** Potential for SMP-initiated refunds that override our policy. Our current refund policy (on `/faq`) would need to be written with awareness that SMP may exercise broader discretion.

### 7.3 — 48-Hour Dispute Response SLA

Seller must respond to information requests within 48 hours. If no response, SMP may refund without seller input.

**Concern:** Operational burden — SWR must be responsive to dispute queries within 48 hours at all times. For a solo founder, this requires reliable notification setup.

### 7.4 — Connected Account Treatment

The seller's Stripe account is treated as a Connected Account to SMP as the Platform. Funds are held in pooled accounts. Seller has no rights to earnings on pooled funds.

**Concern:** Legal structure — the seller becomes a sub-merchant in Stripe's Connect architecture rather than a direct merchant. This may have implications for financial reporting, fund availability timing, and regulatory treatment.

### 7.5 — Customer Data Deletion Cascading

Customers can request deletion. Stripe will cancel subscriptions and delete related Stripe objects (Customer, PaymentMethod, Invoice, etc.) tied to Managed Payments transactions.

**Concern:** Our fulfillment system (Keygen license provisioning, DynamoDB records) must tolerate deletion of upstream Stripe objects. If a Customer ID referenced in our DynamoDB is deleted in Stripe, our system must handle the orphaned reference gracefully.

**Current risk level:** Low — our licensing layer is Keygen-based and decoupled from Stripe Customer objects after initial provisioning. The heartbeat system doesn't query Stripe. But the DynamoDB `stripeCustomerId` and `stripeSubscriptionId` fields would reference deleted objects.

### 7.6 — Indemnification

Seller indemnifies Stripe/SMP for all product-related claims including IP claims. Standard for MoR relationships but should be reviewed.

### 7.7 — Tax on Refunded Transactions

In some jurisdictions, sales tax may still need to be remitted even on refunded transactions, and the seller's balance can be reduced by the tax amount.

**Concern:** Unusual — normally refunds cancel the tax obligation. This edge case could create unexpected balance reductions.

---

## 8. Impact on Pre-Launch Plans

### What Changes

| Planning Element                 | Before (Feb 16–18 docs)                   | After (SMP discovery)                                                       |
| -------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------- |
| **MoR application required**     | Yes — LS + Paddle dual submission         | Possibly no — SMP already available on our account                          |
| **MoR wait time**                | ~1 week (external review)                 | Potentially zero (already approved via existing Stripe KYB)                 |
| **Payment integration effort**   | 8–14 hours (migration)                    | 3–4.5 hours (parameter changes)                                             |
| **AP 8 decision tree**           | 3 paths (LS → Paddle → Stripe fallback)   | 1 preferred path (SMP) + LS/Paddle as backup if SMP preview is discontinued |
| **Track A/B timing**             | Track B fills the ~1 week MoR wait window | Track B timing becomes flexible — no mandatory wait window                  |
| **Dependency Map critical path** | Dominated by MoR application + wait       | Dominated by attorney review + integration testing                          |
| **Total sprint duration**        | ~15 days (dominated by MoR wait)          | Potentially ~10–12 days (wait window shrinks/disappears)                    |

### What Doesn't Change

- **Phase 0 items:** All still valid (Keygen verification, Marketplace publisher check, DMARC, etc.)
- **Track A non-payment work:** Legal review, front-end polish, social media, docs, email — all still needed for launch quality
- **Track B work:** Version wire-up, security audit, monitoring — all still needed
- **C1–C4 cutover structure:** Still valid — production infrastructure still needed
- **AP 12 (Social Media):** Still needed — though no longer MoR-driven urgency, still needed for launch
- **AP 13 (Private Disclosures):** Unchanged
- **AP 11 (Legal Review):** Expanded slightly — must now include SMP preview terms review

### Documents Affected

| Document              | Impact                                                               |
| --------------------- | -------------------------------------------------------------------- |
| **AP 0**              | Updated — item 0.11 added (completed)                                |
| **AP 8**              | Needs revision — SMP becomes preferred path; LS/Paddle become backup |
| **Dependency Map v2** | Needs revision — wait window structure changes                       |
| **v2 Assessment**     | Minor update — AP 8 status note                                      |
| **AP 4**              | Minor — C2 payment webhook config may simplify                       |
| **Launch Plan**       | Not yet written — will incorporate SMP from the start                |
| **All other APs**     | No changes needed                                                    |

---

## 9. Revised MoR Strategy

### New Priority Order

1. **Stripe Managed Payments (SMP)** — preferred. Zero migration, existing integration, already available on our account. Requires attorney review of preview terms and ~3–4.5 hours of integration work.

2. **LS standalone** — backup if SMP preview is discontinued or terms are unacceptable. Would require the migration work described in AP 8 Path A (~8–10 hours). Note: the underlying entity (Lemon Squeezy LLC) is the same as SMP, so a SMP terms rejection would likely also apply to LS.

3. **Paddle** — independent backup if both SMP and LS paths fail. Different entity, different terms, different integration (~10–14 hours). Remains a hedge.

4. **Stripe direct (no MoR)** — emergency fallback. Self-managed tax compliance, geographic restrictions. "Keys in the ocean" — described in AP 8 but only used if all MoR options fail.

### Decision Gate

The decision gate is no longer "which MoR approves us?" — it's "do the SMP preview terms pass attorney review?"

- **If yes:** Enable SMP, integrate (~3–4.5 hours), proceed to C2 production cutover.
- **If terms are unacceptable:** Fall back to LS/Paddle applications (existing AP 8 plan). The ~1 week wait returns.

This makes the attorney review of SMP terms a **new critical path item** — but it's a task SWR controls directly, not an external wait, and it naturally fits into Step A2 (Legal Review) alongside Privacy Policy and ToS.

---

## 10. Open Questions

| #   | Question                                                                              | Priority     | When to Resolve                                   |
| --- | ------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------- |
| 1   | Do the SMP preview terms pass SWR's attorney review? (§7 items)                       | **Critical** | Step A2 (Legal Review)                            |
| 2   | Which of the ~16 forbidden Checkout Session parameters does our code actually use?    | High         | Phase 0 or early Track A                          |
| 3   | How does the Connected Account treatment affect fund availability/payout timing?      | Medium       | During attorney review                            |
| 4   | How does customer data deletion interact with our DynamoDB records?                   | Medium       | During integration testing                        |
| 5   | What is the actual MoR fee on top of standard Stripe processing fees?                 | Medium       | Visible in Dashboard or after terms acceptance    |
| 6   | Is the preview version header requirement persistent, or just for the preview period? | Low          | Monitor — may change when/if SMP goes GA          |
| 7   | Does SMP support all payment methods we currently offer?                              | Medium       | During integration testing                        |
| 8   | How does SMP interact with our existing Stripe Tax configuration?                     | Medium       | During integration — SMP replaces `automatic_tax` |

---

## 11. Sources

Research conducted by GPT-5.2 Thinking on February 18, 2026:

1. [Stripe Managed Payments Documentation](https://docs.stripe.com/payments/managed-payments) — General overview
2. [Stripe Managed Payments Service Terms (Preview)](https://stripe.com/legal/managed-payments) — Legal terms
3. [Finovate: Stripe Acquires Lemon Squeezy](https://finovate.com/stripe-acquires-lemon-squeezy-for-undisclosed-amount/) — Acquisition confirmation
4. [Stripe Managed Payments Marketing Page](https://stripe.com/managed-payments) — Product positioning
5. [Stripe Managed Payments: How It Works](https://docs.stripe.com/payments/managed-payments/how-it-works) — Eligibility, constraints, supported tax codes
6. [Stripe: Update Checkout for Managed Payments](https://docs.stripe.com/payments/managed-payments/update-checkout) — Integration guide (private preview API details)
7. [Stripe Support: LemonSqueezy Entity on SMP Invoice](https://support.stripe.com/questions/why-is-lemonsqueezy-the-legal-entity-on-my-invoice-for-stripe-managed-payments-fees) — Entity confirmation

---

## Document History

| Date       | Author | Changes                                                                                                        |
| ---------- | ------ | -------------------------------------------------------------------------------------------------------------- |
| 2026-02-18 | GC     | Initial discovery memo — SMP available on our account, research summary, impact analysis, revised MoR strategy |
