# Report on SMP Approval Process

**Date:** February 18, 2026
**Author:** GC (GitHub Copilot)
**Status:** RESEARCH COMPLETE
**Classification:** Pre-Launch Planning — Critical Path Analysis
**Requested by:** SWR

---

## 1. Background and Framing Question

SWR identified a critical open question during pre-launch planning: **Does completing the Stripe Managed Payments (SMP) setup flow result in immediate activation, or is there a further gatekeeping review — by Stripe, by Lemon Squeezy (LS), or by both — before SMP approval is granted?**

This question has significant implications for our Launch Plan. If SMP activation is immediate (conditional only on SWR's own legal review of the SMP terms), then the ~1 week MoR application wait window assumed in the Dependency Map v2 is unnecessary, and the entire pre-launch sprint timeline can be compressed. If there is a meaningful review period, then our existing two-track strategy remains largely intact.

Key sub-questions:

- Does LS act as a gatekeeper for global MoR approval for SMP?
- Is there any further gatekeeping beyond completion of the SMP setup flow and prior approval (already obtained) by Stripe to process payments for our products?
- Does setting up SMP trigger a Stripe review, an LS review, or no review at all?

---

## 2. Research Methodology

The following sources were consulted:

1. **Stripe SMP Legal Terms** — `stripe.com/legal/managed-payments` (last updated December 19, 2025)
2. **Stripe Support: Get Started with Stripe Managed Payments** — `support.stripe.com/questions/get-started-with-stripe-managed-payments`
3. **Stripe Support: Managed Payments Topic Hub** — `support.stripe.com/topics/managed-payments` (14 articles)
4. **Stripe Support: Transaction Support and Order Management** — `support.stripe.com/questions/managed-payments-transaction-support-and-order-management`
5. **Stripe Support: Why is LemonSqueezy the legal entity on my invoice?** — `support.stripe.com/questions/why-is-lemonsqueezy-the-legal-entity-on-my-invoice-for-stripe-managed-payments-fees`
6. **Stripe Support: Managed Payments Pricing** — `support.stripe.com/questions/managed-payments-pricing`
7. **Stripe Marketing Page** — `stripe.com/managed-payments`
8. **Stripe Pricing Page** — `stripe.com/pricing#managed-payments`
9. **Stripe MoR Guide** — `stripe.com/resources/more/merchant-of-record`
10. **Stripe Sessions 2025 Archive** — `stripe.com/sessions/2025`
11. **Wayback Machine: docs.stripe.com/payments/managed-payments** — Captured December 22, 2025 and January 17, 2026
12. **Reddit r/stripe** — Thread: "Anyone used Stripe Managed Payments?" (posted ~December 2025, 5 comments)
13. **Link Support: Sold through Link Refunds** — `support.link.com/questions/sold-through-link-refunds`

Note: The live `docs.stripe.com/payments/managed-payments` and its sub-pages were blocked by CSP (Content Security Policy) and could not be accessed directly. Wayback Machine archives were used as a substitute.

---

## 3. Evidence Summary

### 3.1 Evidence Suggesting NO Separate Approval/Review Process

#### 3.1.1 Official Getting-Started Article (Stripe Support)

The official "Get started with Stripe Managed Payments" article describes a purely self-service, 4-step process:

> 1. Log in to your Stripe account and open the Dashboard.
> 2. Click on Settings and select Managed Payments under the Product Settings section.
> 3. Review Terms and Pricing, then click Get Started.
> 4. Follow the activation steps. You may need to create new products, categorize existing products for accurate tax calculations, and update your integration.

**No mention whatsoever of approval, review period, waiting, or KYC.** The language is entirely imperative ("Follow the activation steps") — not conditional ("Wait for approval").

#### 3.1.2 Marketing Page Language

Multiple signals of self-service activation appear on `stripe.com/managed-payments`:

- "Minimal setup required"
- "Enable or disable Managed Payments with just a few clicks, without disrupting existing payment flows"
- "Implement with one line of code"
- "Getting started with Managed Payments is quick and easy. Go live with just one line of code"

None of this language suggests a review gate or approval wait.

#### 3.1.3 SWR's Own Experience

SWR navigated to Step 3 of the SMP setup flow in the Stripe Dashboard without being stopped, redirected to an application form, or encountering any indication of a pending review.

#### 3.1.4 Legal Terms — Account Conversion as Automatic Consequence

The SMP legal terms (§3.1) describe the Connected Account conversion as an automatic consequence of the seller's election, not as a discretionary approval:

> "By using the Stripe Managed Payments Services, your Stripe Account is treated as a Connected Account to SMP as the Platform."

This is framed as something that happens _by using_ the service — not something that requires SMP's or LS's pre-approval.

#### 3.1.5 Reddit User Report (~December 2025)

A Reddit user (Few-Response8328) described actively testing SMP against Paddle "over the last 2 weeks" — approximately 1 month before SWR's discovery — with no mention of an approval delay:

> "We have actively been testing stripe managed payments against Paddle over the last 2 weeks for our web payments. Though we are still giving it another 2 weeks since it would be a process to fully switch, we are seeing an almost 5% increase in payment success with stripe..."

This practical report implies they were able to activate SMP and process live transactions without a waiting period.

---

### 3.2 Evidence of Gating — But as Eligibility Criteria, Not Human Review

#### 3.2.1 Location Eligibility

SMP requires the business to be based in one of the supported countries (North America, Europe, Asia). **The United States qualifies.**

#### 3.2.2 Product Eligibility

SMP supports "the sale of digital products that meet all of the following criteria: (a) The product is sold directly from your business to customers (not through a platform or marketplace), (b) Your business holds all necessary rights and licenses to distribute the product."

**Mouse (a VS Code extension / SaaS developer tool) qualifies on both criteria.**

#### 3.2.3 Prohibited/Restricted Business List

Products must not be on Stripe's Prohibited or Restricted Business list. **Developer tools and AI coding assistants are not prohibited categories.**

#### 3.2.4 "Eligible Sellers" Reference

The pricing article references "eligible sellers" — but this term links to the supported-business-locations section (country eligibility, not individual application review).

---

### 3.3 Evidence of Residual Risk — Post-Activation

#### 3.3.1 Discretionary Suspension/Termination Power

The legal terms (§3.1) state: "SMP reserves the right to suspend or terminate your use of the Stripe Managed Payments Services at any time."

This is a **post-hoc** discretionary power, not a pre-activation gate. It is standard in payment processing agreements and reflects ongoing operational risk management.

#### 3.3.2 Transaction Integrity (§3.8)

SMP can decline, cancel, or refund any transaction it reasonably believes is fraudulent, poses a security risk, or violates the agreement. This is **operational** risk management for individual transactions, not an upfront approval mechanism.

#### 3.3.3 Preview Status Risk

The service can be modified or discontinued: "Stripe and its Affiliates may add or remove features of the Service at any time." This is a long-term service continuity risk, not an activation gate.

---

### 3.4 Historical Context: Private → Public Preview Transition

The Wayback Machine reveals an important evolution:

- **As recently as January 17, 2026**, the docs page (`docs.stripe.com/payments/managed-payments`) still displayed **"Private preview"** with a **"Sign up for the wait-list"** link.
- **Today (February 18, 2026)**: The live Stripe support article, marketing page, and legal terms no longer reference a waitlist. The legal terms (last updated December 19, 2025) call it simply a "Preview Service."
- **The marketing page** prominently features customer testimonials from Unity, Superwall, and Tailwind Labs — consistent with a product that has moved beyond closed private preview.
- **The Reddit poster (~December 2025)** described being "invited for this private preview" — consistent with the private preview phase.

**Conclusion on transition timeline:** Stripe very likely transitioned SMP from **private preview** (invitation-required, waitlist) to **public preview** (self-service activation) sometime between mid-January and mid-February 2026. The fact that SWR was able to access the setup flow on February 18, 2026 without a waitlist or invitation is consistent with this public preview transition.

---

## 4. Analysis: Does LS Act as a Gatekeeper?

The evidence suggests **no**. Specifically:

1. **LS is described as the "legal entity providing the SMP service"** — it is the operational and contractual counterparty — but nothing in the documentation, support articles, or legal terms describes LS as having a separate approval gate.

2. **The Connected Account mechanism** (your Stripe account becoming a Connected Account under the SMP/LS platform) appears to be an **automatic consequence of activation**, not a new application process. The legal terms use the passive voice: "your Stripe Account **is treated as** a Connected Account" — not "your application to become a Connected Account will be reviewed."

3. **Stripe's existing KYB (Know Your Business) approval** appears to be the only identity/compliance verification that matters. You have already been approved by Stripe to process payments for your products. The SMP layer adds MoR services on top of that existing approval — it does not appear to require a separate LS or Stripe KYC review.

4. **The irony is notable:** LS is the same entity that rejected SWR's original standalone LS application. However, the SMP pathway bypasses that application process entirely — it leverages existing Stripe KYB rather than requiring a new LS-specific application. The two pathways (standalone LS vs. SMP via Stripe) appear to have completely separate onboarding flows.

---

## 5. Honest Assessment and Confidence Level

### What We Can Say with Reasonable Confidence

The available evidence strongly suggests that for an existing, approved Stripe customer selling eligible digital products in a supported country, **SMP activation is self-service with no separate human-driven KYC/approval process.**

The documentation consistently describes the flow as "a few clicks" → activate → integrate. There is no mention anywhere in Stripe's support, legal, or marketing materials of an approval wait, application review, or LS gatekeeper.

The fact that SWR's existing Stripe KYB has already been completed appears to be the only review that matters — and the Connected Account restructuring (the account becoming a Connected Account under the SMP/LS platform) appears to be an automatic consequence of activation, not a new application.

### What We Cannot Confirm with Certainty

- The `docs.stripe.com` pages were CSP-blocked, so we were unable to access the **current live** documentation (only Wayback Machine archives through January 17 and the support articles). The live docs may contain guidance that became available after the Private → Public Preview transition.

- The Connected Account mechanism **could theoretically trigger automated fraud/risk screening**, even if it's not a formal "application." Stripe is known for post-hoc account reviews that can occur at any time.

- The recent transition from Private to Public Preview means institutional knowledge about the activation experience is sparse — there simply aren't many public reports from users who went through the Public Preview activation flow.

### Net Confidence Level

**~85-90% confidence** that activation is immediate with no review delay.

The remaining uncertainty is **not** about a _known_ review process that we can't find documentation for — it's about whether Stripe has an _undisclosed_ automated screening step embedded in the activation flow that could introduce a delay. This is residual uncertainty about the unknown, not evidence of a known gate.

---

## 6. Practical Implications for Launch Plan

### If SMP Activation Is Immediate (High Confidence — ~85-90%)

- The **~1 week MoR application wait window** from the Dependency Map v2 is unnecessary
- The **gating factor** becomes SWR's own attorney review of the SMP terms (which SWR controls), not an external approval timeline
- **Track A/B timing** becomes flexible — no mandatory wait window forces parallel work
- The **pre-launch sprint compresses** from ~15 days to ~10-12 days
- **A8 (payment integration)** shrinks from 8-14h migration to 3-4.5h parameter changes
- SMP can potentially be activated and tested on **Day 1** of the sprint

### If SMP Activation Has an Undisclosed Delay (Low Probability — ~10-15%)

- The existing two-track strategy from the Dependency Map v2 remains appropriate
- LS standalone and Paddle fallback paths provide insurance
- The delay would likely be automated (hours to a few days), not the ~1 week manual review assumed for a standalone LS/Paddle application

### Prudent Approach

Proceed with the assumption that activation is immediate, while retaining the LS standalone and Paddle fallback paths as insurance against residual uncertainty. The fallback paths cost nothing to retain in our planning documents — they are already fully explored in AP 8.

---

## 7. Open Questions for Resolution During Setup

These questions will be answered definitively when SWR completes the remaining SMP setup steps:

1. **Does Step 4 ("Follow the activation steps") complete immediately**, or does it end with a "Your application is under review" status?
2. **After activation, can SMP-enabled Checkout Sessions be created immediately** in test mode?
3. **Is there a setup phase** where SMP is "enabled" but transactions are not yet processing (analogous to Stripe's general onboarding where you can create test transactions before completing all verification)?
4. **Does the Dashboard show an "Active" status** for Managed Payments immediately after completing the setup flow?

SWR paused at Step 3 to save progress. Completing Steps 3-4 will definitively answer whether activation is immediate.

---

## 8. Sources Consulted

| #   | Source                     | URL                                                                                                                | Access Method                              |
| --- | -------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| 1   | SMP Legal Terms            | `stripe.com/legal/managed-payments`                                                                                | Direct                                     |
| 2   | Get Started Guide          | `support.stripe.com/questions/get-started-with-stripe-managed-payments`                                            | Direct                                     |
| 3   | Support Topic Hub          | `support.stripe.com/topics/managed-payments`                                                                       | Direct                                     |
| 4   | Transaction Support        | `support.stripe.com/questions/managed-payments-transaction-support-and-order-management`                           | Direct                                     |
| 5   | LS Invoice Entity          | `support.stripe.com/questions/why-is-lemonsqueezy-the-legal-entity-on-my-invoice-for-stripe-managed-payments-fees` | Direct                                     |
| 6   | Pricing Details            | `support.stripe.com/questions/managed-payments-pricing`                                                            | Direct                                     |
| 7   | Marketing Page             | `stripe.com/managed-payments`                                                                                      | Direct                                     |
| 8   | Pricing Page               | `stripe.com/pricing#managed-payments`                                                                              | Direct                                     |
| 9   | MoR Guide                  | `stripe.com/resources/more/merchant-of-record`                                                                     | Direct                                     |
| 10  | Sessions 2025              | `stripe.com/sessions/2025`                                                                                         | Direct                                     |
| 11  | Docs (Archived)            | `docs.stripe.com/payments/managed-payments`                                                                        | Wayback Machine (Dec 22 2025, Jan 17 2026) |
| 12  | Reddit Discussion          | `reddit.com/r/stripe/comments/1ptd29k/anyone_used_stripe_managed_payments/`                                        | Direct                                     |
| 13  | Link Refund Policy         | `support.link.com/questions/sold-through-link-refunds`                                                             | Direct                                     |
| 14  | Live Docs                  | `docs.stripe.com/payments/managed-payments`                                                                        | Blocked (CSP)                              |
| 15  | Live Docs: How It Works    | `docs.stripe.com/payments/managed-payments/how-it-works`                                                           | Blocked (CSP)                              |
| 16  | Live Docs: Update Checkout | `docs.stripe.com/payments/managed-payments/update-checkout`                                                        | Blocked (CSP)                              |

---

## Document History

| Date       | Change                  | Author |
| ---------- | ----------------------- | ------ |
| 2026-02-18 | Initial research report | GC     |
