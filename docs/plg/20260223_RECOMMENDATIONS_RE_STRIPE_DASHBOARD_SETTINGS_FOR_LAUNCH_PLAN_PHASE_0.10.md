# Recommendations: Stripe Dashboard Settings for Launch Plan Phase 0.10

**Date:** February 23, 2026
**Author:** Kiro (Sonnet 4.6 initial draft; Opus 4.6 review and revisions)
**Owner:** SWR
**Status:** DRAFT — awaiting SWR review and execution
**Purpose:** Comprehensive guide for configuring all Stripe dashboard settings in test mode during Phase 0.10. Goal: when production mode is activated, it is a mode switch, not a configuration session. Covers all areas relevant to a global SaaS launch with Stripe Managed Payments (SMP) as the Merchant of Record.

**Companion documents:**
- `20260218_AP8_MOR_STRATEGY_AND_PAYMENT_INTEGRATION_AR.md` — SMP integration plan
- `20260218_STRIPE_MANAGED_PAYMENTS_DISCOVERY.md` — SMP discovery analysis
- `20260218_LAUNCH_EXECUTION_TRACKER.md` — Phase 0 checklist

---

## Context

Phase 0.10 was originally scoped in the tracker as:

> Comprehensive Stripe dashboard settings review — audit all test-mode settings: email receipts (verify payment receipts enabled in Stripe, not SES), tax settings, refund policy, decline handling, dispute settings, branding. Document promotion code configuration for future reference (promo codes for YouTube tutorials, seasonal discounts, etc.). (45m)

The scope has expanded slightly to cover the full set of dashboard settings relevant to a global launch. The guiding principle from AP 8 AR applies here:

> Readying Stripe for promotion to live mode and readying SMP for promotion as our global MoR are the same body of work. Every step that prepares our Stripe integration for production simultaneously prepares it for MoR operation.

With SMP as MoR, Stripe/Link handles global tax calculation and remittance, fraud prevention, dispute responses, and transaction-level customer support. However, a meaningful set of settings remain HIC AI's responsibility to configure correctly. This document covers all of them.

**Suggested session duration:** ~2 hours (includes unhurried attorney review of SMP Preview Terms).

**Sequencing note:** Following review of the initial draft of this memo, SWR has elected to complete all legal review and provide the SMP-GO decision immediately and before proceeding with the completion of Phases 0.10 and 0.11, with the intention of preparing updated, amended, and restated recommendations built off this memo following completion of that review.

---

## Suggested Execution Order

Work through areas in this order — they build on each other logically, and the most foundational items come first.

| # | Area | Est. Time | Priority |
|---|------|-----------|----------|
| 1 | Account & Business Identity | 10 min | Critical |
| 2 | Branding | 10 min | High |
| 3 | Email Notifications (Your Inbox) | 5 min | Critical |
| 4 | SMP Setup Completion | 10 min | Critical — unlocks Stream 1B |
| 5 | Customer Portal | 15 min | High — most decisions |
| 6 | Tax Settings | 10 min | High |
| 7 | Payment Methods | 10 min | High |
| 8 | Radar / Fraud & Dispute Settings | 10 min | Medium |
| 9 | Payouts & Bank Account | 5 min | High |
| 10 | Promotion Codes | 5 min | Low — prep only |

---

## Area 1: Account & Business Identity (~10 min)

**Dashboard path:** Settings → Business details → Public details

This is what customers see on their bank statements and receipts. Incorrect or missing information is the #1 cause of "friendly fraud" disputes — confused customers who don't recognize the charge.

### Statement Descriptor
- Set to something recognizable: `HIC AI MOUSE` or `HIC-AI.COM`
- Constraints: 5–22 characters, must contain at least 5 letters, no `< > \ ' "` characters
- Note: With SMP active, Link/Lemon Squeezy LLC controls the statement descriptor for SMP-processed transactions. Set this correctly regardless — it applies to any non-SMP charges and is part of your account identity. Verify what Link actually shows on statements during Phase 2 test transactions (Stream 1B step 2.4). Customers will likely see "LINK" or "LEMON SQUEEZY" — plan for a support FAQ entry ("Why does my statement say Link?"), already flagged in AP 8 AR §11.

### Shortened Descriptor
- Used on card networks with limited display space
- Recommended: `HIC AI` or `MOUSE`

### Support Contact
- Support phone: optional, but a support URL is important
- Support URL: `https://hic-ai.com/support` (or your support email if no dedicated page yet)
- This appears on receipts and helps customers reach you before disputing a charge

### Business Information
**Dashboard path:** Settings → Business details → Business information
- Verify business name, address, and website are correct
- These appear on invoices and affect how Stripe presents HIC AI, Inc. to card networks
- Website: `https://hic-ai.com`

### Checklist
- [x] Statement descriptor set (5–22 chars, recognizable)
- [x] Shortened descriptor set
- [ ] Support URL set to `https://hic-ai.com/support` or equivalent
- [x] Business name, address, website verified correct

---

## Area 2: Branding (~10 min)

**Dashboard path:** Settings → Branding

Affects the Stripe-hosted checkout page, customer portal, receipts, and invoices. With SMP, Link controls checkout branding to some extent, but your branding still appears in the customer portal and email receipts.

### Logo
- Upload square icon: use `assets/mouse-logo.png` from the repo
- Requirements: JPG or PNG, <512KB, ≥128×128px
- Optionally upload a non-square logo for email headers if available

### Colors
- Brand color: set to your primary brand color (match the website)
- Accent color: used as background on emails and Stripe-hosted pages

### Customer Email Domain (Custom Sending Domain)
**Dashboard path:** Settings → Customer emails → Custom email domains

Configuring a custom sending domain means Stripe sends receipts from `receipts@hic-ai.com` (or similar) rather than `stripe.com`. This improves deliverability, brand recognition, and reduces the chance of receipts landing in spam.

- Requires adding DNS records in GoDaddy (CNAME + TXT for domain verification)
- DNS propagation takes time — configure this now so it's verified before production
- Batch DNS work: add these records in the same GoDaddy session where you verify DMARC propagation (Phase 0 item 0.7) to avoid a context switch
- Recommended sending address: `billing@hic-ai.com` or `receipts@hic-ai.com`
- Note: This is separate from your SES configuration. Stripe's custom domain is for Stripe-sent emails (receipts, invoices). SES handles HIC AI's transactional emails (welcome, license delivery, etc.).

### Receipt Emails
- Confirm "Successful payments" email receipts are enabled — customers should receive a receipt from Stripe/Link after purchase
- With SMP, Link sends its own order confirmation. Stripe's receipt is a supplement/fallback. Keep both enabled.
- Enable "Refund" email notifications to customers

### Checklist
- [x] Logo uploaded (square icon, ≥128×128px)
- [x] Brand color and accent color set
- [ ] Custom email domain configured (DNS records added to GoDaddy)
- [x] Successful payment receipts enabled
- [ ] Refund email notifications enabled

> ⚠️ **ACTION REQUIRED (AP1):** Stripe requires a dedicated refund policy URL to enable the refund notification feature. Our refund policy currently exists only as an answer within the FAQ page. During AP1 front-end work, add a standalone refund policy page (e.g., `https://hic-ai.com/refund-policy`) and then return to the Stripe dashboard to set that URL and enable refund email notifications to customers.

---

## Area 3: Email Notifications — Your Inbox (~5 min)

**Dashboard path:** Settings → Communication preferences

These are notifications to SWR's inbox, not customer-facing emails. Critical for operational awareness, especially the 48-hour dispute SLA under SMP terms §7.3.

### Minimum Required
Enable email notifications for:
- **Disputes** — critical. Under SMP terms, you must respond to dispute information requests within 48 hours or SMP may refund unilaterally. Missing a dispute notification is a direct financial risk.
- **Successful charges** — confirmation you're getting paid
- **Failed payments** — awareness of payment issues
- **Payouts** — know when money hits your bank account
- **Refunds issued** — track refund activity

### SMS Notifications
- Enable SMS for **disputes** specifically
- 48 hours goes fast if you're in court all day. SMS ensures you don't miss a dispute notification that arrives while you're away from email.

### Checklist
- [x] Dispute email notifications enabled
- [ ] Dispute SMS notifications enabled
- [x] Successful charge notifications enabled
- [x] Failed payment notifications enabled
- [x] Payout notifications enabled
- [ ] Refund notifications enabled

> ⚠️ **NOTE:** Refund notifications to customers (line above) are pending the refund policy URL. See Area 2 note above.

---

## Area 4: SMP Setup Completion (~10 min)

**Dashboard path:** Settings → Managed Payments

This is the most consequential item in the session. SMP setup was saved at Step 3 of 4 on Feb 18. Completing it activates SMP in test mode and is the prerequisite for Stream 1B code integration.

### Steps to Complete
- Navigate to Settings → Managed Payments
- Resume the setup flow from Step 3
- Step 4 is where the SMP Preview Terms are formally accepted in the dashboard

### Attorney Review — GO/NO-GO Decision (SWR Item S1)

Before accepting the terms, SWR must make the GO/NO-GO call as attorney. The seven provisions requiring review are documented in AP 8 AR §4 Phase 1.4. Summary of the two with real operational implications:

| Provision | Implication | Assessment |
|-----------|-------------|------------|
| 60-day refund discretion | SMP (Lemon Squeezy LLC) may issue refunds within 60 days regardless of HIC AI's policy. Seller bears the cost. | Standard MoR behavior. Matches LS/Paddle policy. Manageable. |
| 48-hour dispute response SLA | Must respond to dispute info requests within 48 hours or SMP may refund unilaterally. | Operational burden for solo founder. Mitigated by notification setup in Area 3. |

The remaining five provisions (Preview status, Connected Account treatment, Customer Data Deletion, Indemnification, Tax on Refunded Transactions) are documented in full in AP 8 AR §4.1.4 and the SMP Discovery Memo §7.

**This is SWR's call.** Once GO is issued and terms are accepted in the dashboard, SMP is active in test mode.

### Checklist
- [ ] SMP setup flow resumed and completed (all 4 steps)
- [x] SMP Preview Terms reviewed as attorney
- [x] GO/NO-GO decision documented (update tracker Decision Log)
- [ ] If GO: SMP active in test mode confirmed

---

## Area 5: Customer Portal (~15 min)

**Dashboard path:** Settings → Billing → Customer portal

The customer portal is the self-service interface for subscribers to manage their subscriptions, update payment methods, and cancel. This area has the most decisions to make. Several are resolved below based on SWR's direction; open questions are flagged in the Open Decisions section.

### Resolved Decisions

**Plan upgrades/downgrades (Individual ↔ Business):**
SWR has confirmed: **no self-serve plan changes between Individual and Business tiers.** Rationale: proration calculations, partial charges, credits, and refund handling are complex and messy to manage pre-launch. Most early purchasers will be individuals, not business teams. Upgrades/downgrades will be handled manually (or via the admin portal) post-launch when the volume and use cases are better understood.

- Configure: disable "Allow customers to switch plans" or equivalent upgrade/downgrade option in the portal

**Business seat management:**
SWR has confirmed: **self-serve seat add/remove is enabled for Business licenses and was verified working E2E.** Today's session should re-verify this is still configured correctly and functioning.

- Configure: allow Business subscribers to update quantity (add/remove seats)
- Verify: seat changes trigger the correct webhook events and DynamoDB updates

### Configuration Checklist

**Payment & Billing:**
- [x] Allow customers to update payment methods: **Yes**
- [x] Allow customers to update billing address: **Yes**
- [x] Invoice history visible and downloadable: **Yes**

**Subscription Management:**
- [x] Allow customers to cancel subscriptions: **Yes** — required by FTC "click-to-cancel" rule (effective July 14, 2025)
- [x] Cancellation timing: set to "at end of billing period" (not immediately) — standard for subscription SaaS
- [x] Cancellation reason collection: **Enable** — valuable churn data, accessible via webhooks or Stripe Sigma
- [x] Cancellation deflection / coupon offer: configure the option now (even without an active coupon) so it can be activated later without a configuration session
- [x] Allow plan upgrades/downgrades (Individual ↔ Business): **Disabled** — per SWR decision above
- [ ] Allow Business seat quantity changes: **Enabled** — per SWR decision above; re-verify E2E today

**Portal Identity:**
- [x] Business name: `HIC AI, Inc.`
- [x] Privacy policy URL: `https://hic-ai.com/privacy`
- [x] Terms of service URL: `https://hic-ai.com/terms`

---

## Area 6: Tax Settings (~10 min)

**Dashboard path:** Products → each product → Tax code; Settings → Tax

With SMP as MoR, Stripe handles all tax calculation and remittance globally across 75+ countries. HIC AI has no filing obligations in SMP-covered jurisdictions. However, the product tax codes must be correctly set — SMP uses them to determine the applicable tax rate per jurisdiction.

### Product Tax Codes
Verify all 4 products have the correct tax code:

| Product | Price | Expected Tax Code |
|---------|-------|-------------------|
| Mouse Individual Monthly | $15/mo | `txcd_10103101` — SaaS — electronic download — business use |
| Mouse Individual Annual | $150/yr | `txcd_10103101` — SaaS — electronic download — business use |
| Mouse Business Monthly | $35/seat/mo | `txcd_10103101` — SaaS — electronic download — business use |
| Mouse Business Annual | $350/seat/yr | `txcd_10103101` — SaaS — electronic download — business use |

✅ **Completed Feb 23.** Tax code changed from `txcd_10202003` (downloadable software — business use) to `txcd_10103101` (SaaS — electronic download — business use) on all 4 products in the Stripe dashboard. SaaS classification is correct for a subscription-licensed VS Code extension with heartbeat validation and continuous vendor-controlled updates. Decision made after attorney review and analysis of tax treatment differences across jurisdictions.

### Origin Address
- Verify your origin address in tax settings is correct — used for tax nexus calculations in some jurisdictions

### Checklist
- [x] All 4 products updated to correct SaaS tax code (`txcd_10103101`) ✅ (Feb 23)
- [x] Origin address verified correct
- [ ] Tax settings page reviewed — no unexpected configurations


> ⚠️ **NOTE:** The Stripe Tax Setup Guide prompts for configuration of a Tax Registration (nexus registration per jurisdiction). This has been left blank intentionally — we are relying on SMP (Stripe Managed Payments / Lemon Squeezy LLC) as our global Merchant of Record to handle all tax calculation, collection, and remittance. No manual tax registrations are required on our part for SMP-covered jurisdictions.

---

## Area 7: Payment Methods (~10 min)

**Dashboard path:** Settings → Payment methods

With SMP, Stripe/Link manages payment method availability at checkout to some extent. Review what's configured and ensure global coverage for a developer audience.

### Recommended for Launch

**Core (must have):**
- Cards: Visa, Mastercard, Amex — enabled by default
- Apple Pay — high conversion for Mac/iOS users (significant overlap with developer audience)
- Google Pay — high conversion for Android/Chrome users
- Link (Stripe's saved payment network) — frictionless repeat purchases

**European coverage (strong developer market):**
- SEPA Direct Debit — Germany, France, Netherlands, Spain, Italy, Belgium, and more
- iDEAL — Netherlands (very high adoption)
- Bancontact — Belgium
- Sofort / Klarna — Germany, Austria

**Note:** With SMP, some payment methods may be managed by Link automatically. Verify which methods you control vs. which SMP controls. The goal is to ensure no major developer market is left without a convenient payment option.

### Defer to Post-Launch
- PayPal — adds complexity, worth evaluating post-launch based on customer requests
- Crypto — not appropriate for a subscription SaaS at this stage

### Checklist
- [x] Cards (Visa, Mastercard, Amex) confirmed enabled
- [ ] Apple Pay confirmed enabled
- [ ] Google Pay confirmed enabled
- [x] Link confirmed enabled
- [ ] European payment methods reviewed — enable SEPA, iDEAL, Bancontact if available
- [ ] Confirm which payment methods SMP controls vs. HIC AI controls


> ⚠️ **DEFERRED:** Additional payment methods (Apple Pay, Google Pay, European methods such as SEPA/iDEAL/Bancontact) cannot be enabled at present within the Customer Portal settings. This will be revisited after completing the SMP rollout (Stream 1B), at which point it will be clearer which payment methods SMP/Link controls automatically vs. which require manual configuration.
---


## Area 8: Radar / Fraud & Dispute Settings (~10 min)

**Dashboard path:** Radar → Rules; Settings → Disputes

With SMP as MoR, Stripe/Link handles fraud prevention and dispute responses. However, Radar is still active on your account and you should understand what it's doing.

### Radar Rules
- Review default rules. The defaults are sensible for most businesses.
- Default blocking threshold: risk score > 75. This is appropriate for launch.
- Default manual review threshold: risk score > 65. Review flagged payments periodically.
- Primary risk for a developer SaaS: card testing (bots trying stolen card numbers) and friendly fraud (customers who don't recognize the charge and dispute it). The default rules handle card testing well. For friendly fraud, the best defense is the notification setup in Area 3 + clear statement descriptors (Area 1) + good receipts (Area 2) — all covered by this memo.
- Avoid over-tuning at launch — false positives hurt conversion more than fraud at early volumes. Let the defaults run and adjust based on actual patterns post-launch.

**One rule worth considering:**
Block if card country is on a high-fraud list AND risk score is elevated. Stripe's default rules may already cover this. Verify before adding custom rules.

### Dispute Awareness
- With SMP, Stripe/Link handles dispute responses as MoR. However, you must still respond to dispute information requests within 48 hours (SMP terms §7.3).
- Familiarize yourself with the dispute evidence submission flow now — don't learn it under pressure when a real dispute arrives.
- For a SaaS with digital delivery, your evidence package typically includes: checkout session details, license activation records, heartbeat logs, customer email correspondence.

### Checklist
- [x] Radar default rules reviewed — no unexpected configurations
- [x] Blocking threshold confirmed appropriate (default: >75)
- [x] Dispute evidence submission flow reviewed and understood
- [x] Notification setup from Area 3 confirmed sufficient for 48-hour SLA

---

## Area 9: Payouts & Bank Account (~5 min)

**Dashboard path:** Settings → Bank accounts and scheduling

### Bank Account
- Verify bank account details are correct. Incorrect bank info is the #1 cause of payout delays.
- Confirm the account is the HIC AI, Inc. Mercury account.

### Payout Schedule
- Default: daily (as funds become available). Recommended for launch.
- Alternative: weekly, if you prefer batched payouts for accounting purposes.
- For launch, daily is fine and provides the fastest feedback that live payments are flowing correctly.

### First Payout Note
Stripe holds first payouts on new live-mode accounts for 7–14 days. This is normal and expected — do not interpret it as a problem. Plan for this when timing the dogfooding purchase (Phase 5 Step 5A).

### Multi-Currency
- For launch, USD-only with Stripe's automatic currency conversion is simplest.
- Stripe converts foreign currency payments to USD before payout. The conversion rate is competitive.
- Post-launch: if significant EUR or GBP volume develops, adding dedicated bank accounts per currency eliminates conversion fees.

### Checklist
- [x] Bank account details verified correct (Mercury account)
- [x] Payout schedule set (daily recommended)
- [ ] Multi-currency strategy confirmed (USD-only for launch, auto-convert)

---

## Area 10: Promotion Codes (~5 min)

**Dashboard path:** Products → Coupons

No coupons need to be published at launch. The goal here is to understand the coupon/promotion code structure in the dashboard and document a naming convention. Defer coupon creation to when a promotion is actually planned — it's trivial to create one at that point.

### Structure
- **Coupons** define the discount (% off, $ off, duration, redemption limits)
- **Promotion codes** are the customer-facing codes that reference a coupon (e.g., `TUTORIAL10`, `YOUTUBE20`)
- One coupon can have multiple promotion codes, each with independent usage limits and expiry dates

### Recommended Approach
Review the coupon/promotion code creation flow in the dashboard so the mechanics are understood. When ready to run a promotion (YouTube tutorial, Show HN launch, seasonal), create a coupon with appropriate parameters (% off, duration, redemption cap) and attach promotion codes to it.

### Future Promotion Code Ideas
- `SHOWHACKER` — Show HN launch
- `YOUTUBE` + creator name — YouTube tutorial partnerships
- `LAUNCH25` — general launch discount
- `BUSINESS10` — Business plan acquisition discount

### Checklist
- [ ] Coupon/promotion code structure reviewed in dashboard
- [ ] Promotion code naming convention decided

---

## Open Decisions

The following items require SWR's decision before or during the dashboard session.

### OD-1: SMP GO/NO-GO (SWR Item S1) — BLOCKING

**Question:** Do the SMP Preview Terms pass SWR's attorney review?

**Context:** Seven provisions documented in AP 8 AR §4.1.4. The two with real operational implications are the 60-day refund discretion and the 48-hour dispute response SLA. Both are manageable; both are standard MoR behavior.

**Options:**
- GO — accept terms, complete SMP setup, proceed to Stream 1B
- CONDITIONAL GO — accept with documented risk acknowledgment
- NO-GO — invoke contingency (LS/Paddle applications per prior AP 8)

**Deadline:** Must be resolved during this session. Stream 1B cannot begin until SMP is active in test mode.

---

### OD-2: Custom Email Sending Domain — RESOLVED

**Decision:** Configure now. The DNS work is ~5 minutes and propagation runs passively. Batch with DMARC verification (Phase 0 item 0.7) in GoDaddy. No reason to defer.

---

### OD-3: Cancellation Deflection Coupon

**Question:** Enable cancellation deflection in the customer portal at launch, and if so, with what offer?

**Context:** When a customer tries to cancel, Stripe can offer a discount coupon to retain them. Requires having an active coupon configured. Valuable for reducing churn but requires deciding on the offer amount and duration.

**Options:**
- Enable at launch with a specific offer (e.g., 1 month free, 20% off next 3 months)
- Enable the feature but leave coupon unset for now (no deflection until coupon is configured)
- Disable for launch, enable post-launch

**Recommendation:** Enable the feature now, leave coupon unset. This way the infrastructure is in place and you can activate deflection by simply assigning a coupon — no dashboard configuration session needed.

---

### OD-4: European Payment Methods

**Question:** Enable SEPA Direct Debit, iDEAL, Bancontact, and/or Sofort at launch?

**Context:** Mouse's target audience is global developers. European developers are a significant market. These payment methods reduce friction for EU customers. However, each may require additional configuration or verification.

**Options:**
- Enable all available European methods now
- Enable cards + Apple Pay + Google Pay + Link only for launch; add European methods post-launch based on demand
- Research which methods SMP controls automatically before deciding

**Recommendation:** Check what SMP enables automatically. Enable any that are available without additional configuration. Defer complex ones to post-launch.

---

### OD-5: Payout Schedule — RESOLVED

**Decision:** Daily for launch. Provides fastest feedback that live payments are flowing correctly. Revisit when accounting workflows are established.

---

### OD-6: Business Seat Self-Service Re-Verification

**Question:** Is Business seat add/remove still working correctly E2E after all recent code changes?

**Context:** SWR confirmed this was working as of last E2E test. Today's session should re-verify: seat change in portal → webhook fires → DynamoDB updates → Keygen seat count updates → correct billing.

**Action:** Re-run the Business seat change flow during this session. Document result.

---

## Phase 0.10 Exit Checklist

All items below must be checked before Phase 0.10 is marked complete.

**Area 1 — Account & Business Identity:**
- [x] Statement descriptor set
- [x] Shortened descriptor set
- [ ] Support URL set
- [x] Business name, address, website verified

**Area 2 — Branding:**
- [x] Logo uploaded
- [x] Brand and accent colors set
- [ ] Custom email domain configured (DNS records added)
- [x] Receipt emails enabled

**Area 3 — Notifications:**
- [x] Dispute email + SMS notifications enabled
- [x] Successful charge, failed payment, payout, refund notifications enabled

**Area 4 — SMP:**
- [ ] SMP setup flow completed (all 4 steps)
- [x] GO/NO-GO decision documented in tracker Decision Log
- [ ] SMP active in test mode confirmed

**Area 5 — Customer Portal:**
- [x] Payment method updates enabled
- [x] Cancellation enabled (end of period)
- [x] Cancellation reason collection enabled
- [x] Plan upgrades/downgrades disabled (Individual ↔ Business)
- [x] Business seat quantity changes enabled and re-verified E2E
- [x] Business name, privacy policy URL, ToS URL set

**Area 6 — Tax:**
- [x] All 4 products verified with correct SaaS tax code
- [x] Origin address verified

**Area 7 — Payment Methods:**
- [x] Core methods confirmed (cards, Apple Pay, Google Pay, Link)
- [ ] European methods reviewed

**Area 8 — Radar / Disputes:**
- [x] Default Radar rules reviewed
- [x] Dispute flow understood

**Area 9 — Payouts:**
- [x] Bank account verified
- [x] Payout schedule set

**Area 10 — Promotion Codes:**
- [ ] Coupon/promotion code structure reviewed
- [ ] Naming convention decided

**Open Decisions:**
- [x] OD-1: SMP GO/NO-GO resolved and documented
- [x] OD-2: Custom email domain configured (RESOLVED — configure now)
- [x] OD-3: Cancellation deflection decision made
- [x] OD-4: European payment methods decision made
- [x] OD-5: Payout schedule set to daily (RESOLVED)
- [x] OD-6: Business seat self-service re-verified E2E

**Phase 0.10 complete when all boxes above are checked.**

---

## What Comes Next

After Phase 0.10 is complete:

- **Phase 0.11** — SMP Integration Validation: synthesize findings from 0.8–0.10, map against SMP requirements, produce formal go/no-go recommendation. This is the Phase 0 → Phase 1 bridge. (~30–45 min)
- **CP-0 achieved** — all Phase 0 items complete. Phase 1 unlocked.
- **Stream 1B** — SMP code integration begins: add `managed_payments: { enabled: true }`, set preview version header, remove ~16 forbidden parameters, re-verify all 4 checkout paths.

---

## Document History

| Date | Author | Changes |
|------|--------|---------|
| 2026-02-23 | Kiro (Sonnet 4.6) | Initial creation — comprehensive Phase 0.10 guide covering 10 dashboard areas, resolved decisions, open decisions, and full exit checklist |
| 2026-02-23 | Kiro (Opus 4.6) | Review and revisions — updated session duration (~2h), added SWR sequencing decision (legal review first), resolved OD-2 (configure now) and OD-5 (daily), added statement descriptor FAQ cross-reference (AP 8 AR §11), DNS batching note, friendly fraud risk note, simplified promotion codes recommendation, added Addendum with extended discussion items |

---

## Addendum: Extended Discussion Items (Kiro Opus 4.6 Review)

The following items surfaced during the Opus 4.6 review of the initial draft. They require more extended consideration than a surgical inline edit and are collected here for SWR's reference.

### A-1: Tax Code — SaaS vs. Downloadable Software

✅ **RESOLVED Feb 23.** Tax code changed from `txcd_10202003` to `txcd_10103101` (SaaS — electronic download — business use) on all 4 products.

The specific code selected was `txcd_10103101` ("Software as a service (SaaS) — electronic download — business use") rather than the generic `txcd_10103001`, because the "electronic download" qualifier accurately reflects Mouse's delivery mechanism (VS Code extension download) while the SaaS classification reflects the subscription nature, continuous updates, and server-side license validation. This was done before any live transactions exist, avoiding mid-cycle tax recalculation issues.

### A-2: European Payment Methods (OD-4)

The memo leaves OD-4 open. The review recommends resolving it as: cards + Apple Pay + Google Pay + Link only for launch.

European local payment methods (SEPA Direct Debit, iDEAL, Bancontact, Sofort/Klarna) add meaningful complexity for subscription billing — SEPA mandates, delayed settlement windows, different failure modes, and additional configuration/verification steps. Mouse's initial audience is likely US/UK developers. The conversion benefit of European local methods is real but marginal at launch volumes.

**Recommendation:** Resolve OD-4 as "cards + wallets + Link only for launch." Add European methods post-launch when there is data showing EU demand that justifies the configuration overhead. Check what SMP enables automatically — if any European methods come free with SMP activation, accept them; don't add any that require additional setup.

### A-3: Tracker Cross-References

Two cross-reference items to address when updating the tracker after this session:

1. **Time estimate mismatch.** The tracker (Phase 0.10) scopes this work at 45 minutes. The memo now scopes it at ~2 hours. Update the tracker's time estimate for item 0.10 to reflect reality.

2. **Sequencing pull-forward.** The tracker places SMP setup completion (AP 8 Phase 3, steps 3.1–3.4) in Phase 3 Stream 3C, gated on the SMP-GO decision. If SWR completes the SMP-GO decision and SMP setup during this Phase 0.10 session (as the sequencing note now contemplates), then Stream 3C step 3.1 is done early and the SMP-GO gate is resolved here rather than at Phase 3. This is better — it unblocks Stream 1B sooner. Document the deviation in the tracker's Deviation Log so the paper trail is clean.

