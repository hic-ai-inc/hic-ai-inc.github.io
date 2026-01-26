# MEMORANDUM

**TO:** Simon Reiff, President & Technical Founder  
**FROM:** GC  
**DATE:** January 22, 2026  
**RE:** Proposed Pricing Changes for PLG Implementation

**Version:** 1.1 (revised per GPT-5.2 peer review)

> ⚠️ **SUPERSEDED (January 25, 2026)**
>
> This document has been superseded by:
>
> - [20260125_ADDENDUM_PRICING_MODEL_v3_CONCURRENT_SESSIONS.md](./20260125_ADDENDUM_PRICING_MODEL_v3_CONCURRENT_SESSIONS.md)
>
> Key changes from this proposal:
>
> - **Pricing increased:** Individual $10→$15, Enterprise $25→$49, new Team tier at $35
> - **OSS tier deferred:** Will implement post-launch if needed
> - **Session-based licensing:** Replaces device-count model to solve container problems
>
> This document is retained for historical context only.

| ----------- | -------------- | --------------------------------- |
| Open Source | $0/month | Verified OSS maintainers |
| Individual | $10/seat/month | Solo developers, freelancers, SMB |
| Enterprise | $25/seat/month | Organizations with 10+ seats |

**Key Rationale:**

- **Volume over extraction** — Maximize adoption to prove GTM mechanics
- **Cash flow positive** — Generate real revenue, even if modest
- **Brand building** — Developer mindshare converts to enterprise credibility
- **Learning** — Understand enterprise buyer behavior before OOXML launch

**Implementation Principles (revised per peer review):**

- **Single price ladder** — No "launch pricing" SKUs; use Stripe coupons for time-boxed promos
- **Clean SKU structure** — 6 products maximum, not 10
- **Consistent policies** — Trial and device limits aligned across all documentation

---

## 1. Current Pricing (Previous Specifications)

Our prior PLG specifications assumed premium pricing:

| Tier       | List Price     | Launch Price (50% off) |
| ---------- | -------------- | ---------------------- |
| Individual | $40/seat/month | $20/seat/month         |
| Team       | $50/seat/month | $25/seat/month         |
| Enterprise | Custom         | Contact sales          |

**Implicit assumptions in this model:**

- Mouse commands premium pricing due to measurable productivity gains
- Enterprises will pay $50/seat for tools that reduce AI execution slop
- 50,000 seats at $50/month = $30M ARR target

**Problem:** These assumptions optimize for revenue per seat, not market penetration. At $50/seat, we're competing with established developer tools and facing significant procurement friction. The evidence (p < 0.05 improvements) supports value, but the market hasn't yet validated willingness to pay at this level.

---

## 2. Strategic Context: Mouse as Beachhead

### 2.1 The Long-Term Prize

HIC AI's ultimate opportunity is **OOXML compatibility for AI assistants**—enabling AI to work natively in Microsoft Word, Excel, and PowerPoint. This unlocks:

- **Total Addressable Market:** $100B+ (knowledge workers globally)
- **Buyer profile:** Law firms, consulting firms, financial services, corporate
- **Price tolerance:** $50-100/seat/month (standard enterprise software)
- **Seat counts:** 500-50,000+ per organization

### 2.2 Mouse's Role in the Journey

Mouse for developers is **not** the profit engine. It serves four strategic purposes:

| Purpose                     | Value                                                        |
| --------------------------- | ------------------------------------------------------------ |
| **Proof of GTM**            | Payment → license → install → renew actually works at scale  |
| **Cash flow**               | Real revenue beats zero revenue; extends runway              |
| **Brand building**          | Developer credibility translates to enterprise sales         |
| **Organizational learning** | What do enterprise buyers need? Discover before OOXML launch |

**If Mouse is the proving ground, not the endgame, we should optimize for adoption, not extraction.**

### 2.3 The Volume Thesis

At lower price points:

- Individuals purchase without approval (personal credit card, expense later)
- Enterprise procurement friction decreases (below approval thresholds)
- Word-of-mouth accelerates (more users = more advocates)
- Churn decreases (low cost = low incentive to cancel)

---

## 3. Proposed Pricing Structure

### 3.1 Tier 1: Open Source — $0/month

**Target:** Verified open source maintainers

| Attribute      | Specification                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------ |
| Price          | Free (forever)                                                                                               |
| Eligibility    | GitHub Sponsors participant, repository with 100+ stars, or NPM/PyPI maintainer with 1,000+ weekly downloads |
| Devices        | 1                                                                                                            |
| Commercial use | ❌ No (OSS projects only)                                                                                    |
| Support        | Community (Discord, GitHub Issues)                                                                           |
| License type   | Non-transferable, annual re-verification                                                                     |

**Rationale:**

Open source maintainers are **high-influence, low-volume**. Their public endorsements and tool recommendations carry outsized weight in developer communities. A single tweet from a respected maintainer reaches thousands of potential customers.

**Cost to HIC AI:**

- License validation: ~$0.001/validation (negligible)
- Support: Community-driven (Discord, not email)
- Abuse prevention: GitHub API verification (automated)

**Expected volume:** 1,000-5,000 licenses (cap if needed)

**Value to HIC AI:**

- Brand ambassadors who create organic marketing
- GitHub presence (stars, discussions, integration examples)
- Feedback from sophisticated users who push tool boundaries

### 3.2 Tier 2: Individual — $10/seat/month

**Target:** Solo developers, freelancers, small teams (<10 people)

| Attribute       | Specification                                |
| --------------- | -------------------------------------------- |
| Price (Monthly) | $10/seat/month                               |
| Price (Annual)  | $100/seat/year (17% discount, 2 months free) |
| Devices         | 3 per license                                |
| Commercial use  | ✅ Yes                                       |
| Support         | Email (48-hour response SLA)                 |
| Trial           | 14 days, no credit card required             |

**Rationale:**

$10/month is **impulse-buy territory**. It's less than:

- A single lunch out
- A month of Spotify
- Most IDE plugins with commercial licensing

At this price point:

- **No approval needed** — Individual developers don't need manager sign-off
- **Personal credit card acceptable** — "I'll expense it" or just pay it
- **Low churn incentive** — Not worth the hassle to cancel $10/month
- **High word-of-mouth** — Affordable tools spread faster

**Psychology:** When a developer asks "Is Mouse worth it?", $10/month makes the answer almost always "yes" if the product delivers any measurable value. Our evidence shows statistically significant improvement—at $10/month, the ROI argument is trivial.

**Expected conversion funnel:**

```
Website visitors:     100,000/month (goal)
Trial starts:          10,000 (10% conversion)
Trial → Paid:           2,000 (20% trial conversion)
Monthly acquisition:    2,000 new seats
```

### 3.3 Tier 3: Enterprise — $25/seat/month

**Target:** Organizations with 10+ developers

| Attribute            | Specification                                   |
| -------------------- | ----------------------------------------------- |
| Price (Base)         | $25/seat/month                                  |
| Billing              | Annual only ($300/seat/year)                    |
| Minimum seats        | 10                                              |
| Devices              | 2 per seat                                      |
| SSO/SAML             | ✅ Included                                     |
| Admin console        | ✅ Seat management, usage analytics, audit logs |
| Support              | Priority email (24-hour SLA)                    |
| Support (100+ seats) | Dedicated Slack channel                         |
| Billing options      | Credit card or Invoice (NET-30)                 |
| Trial                | 30 days, credit card required                   |

**Volume discounts:**

| Seat Count | Discount | Effective Price   |
| ---------- | -------- | ----------------- |
| 10-99      | 0%       | $25/seat/month    |
| 100-499    | 10%      | $22.50/seat/month |
| 500-999    | 20%      | $20/seat/month    |
| 1,000+     | Custom   | Contact sales     |

**Rationale:**

$25/seat/month ($300/year) positions Mouse as **professional but accessible**:

- **Below typical approval thresholds** — Many organizations auto-approve tools under $500/seat/year
- **Competitive with alternatives** — GitHub Copilot Business is $19/seat/month; we're in range
- **Margin for volume discounts** — Room to negotiate with large buyers without going negative
- **Annual-only simplifies operations** — Predictable revenue, reduced churn processing

**Why not $10/seat for Enterprise too?**

Enterprise buyers have different expectations:

1. **SSO/SAML is table stakes** — Implementation and support cost money
2. **Admin consoles require development** — Seat management, analytics, audit logs
3. **Support SLAs are binding** — 24-hour response requires staffing
4. **Invoice billing has costs** — AR management, collections, NET-30 cash flow delay

$25/seat covers these costs while remaining accessible. Large buyers get volume discounts that approach the Individual price at scale.

---

## 4. Immediate Business Impact

### 4.1 Revenue Projections

**Scenario A: Conservative (Year 1)**

| Tier        | Seats      | Price            | ARR        |
| ----------- | ---------- | ---------------- | ---------- |
| Open Source | 2,000      | $0               | $0         |
| Individual  | 10,000     | $10/mo           | $1.2M      |
| Enterprise  | 5,000      | $24/mo (blended) | $1.44M     |
| **Total**   | **17,000** |                  | **$2.64M** |

**Scenario B: Moderate (Year 1)**

| Tier        | Seats      | Price            | ARR        |
| ----------- | ---------- | ---------------- | ---------- |
| Open Source | 5,000      | $0               | $0         |
| Individual  | 30,000     | $10/mo           | $3.6M      |
| Enterprise  | 15,000     | $23/mo (blended) | $4.14M     |
| **Total**   | **50,000** |                  | **$7.74M** |

**Scenario C: Aggressive (Year 1)**

| Tier        | Seats       | Price            | ARR         |
| ----------- | ----------- | ---------------- | ----------- |
| Open Source | 5,000       | $0               | $0          |
| Individual  | 75,000      | $10/mo           | $9M         |
| Enterprise  | 40,000      | $22/mo (blended) | $10.56M     |
| **Total**   | **120,000** |                  | **$19.56M** |

### 4.2 Path to $30M ARR

| Tier        | Seats Required | % of SAM                                     |
| ----------- | -------------- | -------------------------------------------- |
| Open Source | 5,000          | N/A (brand investment)                       |
| Individual  | 100,000        | <1% of VS Code users                         |
| Enterprise  | 60,000         | 3% of SAM-1 (2M developers at 25+ seat orgs) |
| **Total**   | **165,000**    |                                              |

**ARR at these volumes:**

- Individual: 100,000 × $10 × 12 = $12M
- Enterprise: 60,000 × $25 × 12 = $18M (before volume discounts)
- **Total: ~$30M ARR**

### 4.3 Comparison to Previous Pricing

| Metric                  | Previous ($40-50/seat) | Proposed ($10-25/seat) |
| ----------------------- | ---------------------- | ---------------------- |
| Seats to $30M ARR       | ~50,000                | ~165,000               |
| Avg price per seat      | ~$50/mo                | ~$15/mo (blended)      |
| Procurement friction    | High                   | Low                    |
| Trial conversion (est.) | 10-15%                 | 20-30%                 |
| Word-of-mouth velocity  | Moderate               | High                   |
| Time to $1M ARR         | 12-18 months           | 6-9 months             |

### 4.4 Unit Economics

**Individual tier ($10/month):**

| Item                               | Cost                    |
| ---------------------------------- | ----------------------- |
| Stripe fees (2.9% + $0.30)         | $0.59/month             |
| Keygen.sh (per-license allocation) | ~$0.10/month            |
| AWS (DynamoDB, Lambda, validation) | ~$0.05/month            |
| Email (SES transactional)          | ~$0.01/month            |
| Support (amortized)                | ~$0.50/month            |
| **Total COGS**                     | **~$1.25/month**        |
| **Gross margin**                   | **$8.75/month (87.5%)** |

**Enterprise tier ($25/month):**

| Item                             | Cost                     |
| -------------------------------- | ------------------------ |
| Stripe/Invoice processing        | $0.75/month              |
| Keygen.sh                        | ~$0.10/month             |
| AWS infrastructure               | ~$0.10/month             |
| SSO/SAML (Auth0 allocation)      | ~$0.50/month             |
| Support (priority, higher touch) | ~$2.00/month             |
| **Total COGS**                   | **~$3.45/month**         |
| **Gross margin**                 | **$21.55/month (86.2%)** |

**Blended gross margin: ~87%** — Healthy for SaaS.

---

## 5. Why Consider This Change Now

### 5.1 Market Timing

The AI coding assistant market is nascent but accelerating. Winners will be determined in the next 12-24 months. Low pricing now:

- **Captures market share** before competitors entrench
- **Builds switching costs** through habit and workflow integration
- **Generates testimonials and case studies** for enterprise sales

### 5.2 Cash Flow Reality

HIC AI needs revenue to:

- Extend runway during pre-funding phase
- Demonstrate traction to investors (revenue > users > ideas)
- Fund continued development without dilution

$10/seat generates real cash. 10,000 seats = $100K/month = $1.2M/year. That's meaningful.

### 5.3 GTM Learning

Before launching OOXML compatibility to knowledge workers, we need to understand:

- What does enterprise procurement actually look like?
- What support do enterprise buyers require?
- What features drive retention vs. churn?
- How do we handle invoice billing at scale?

Mouse at $25/seat/month teaches us these lessons with lower stakes than OOXML at $50-100/seat/month.

### 5.4 Competitive Positioning

Current market:

- **GitHub Copilot Business:** $19/seat/month
- **Cursor Pro:** $20/month
- **Codeium Enterprise:** $15/seat/month (estimated)

At $25/seat for Enterprise, we're competitive. At $10/seat for Individual, we're aggressive but sustainable.

**Market pricing reference (January 2026):**

| Competitor           | Individual | Business/Team | Enterprise      |
| -------------------- | ---------- | ------------- | --------------- |
| GitHub Copilot       | $10/mo     | $19/seat/mo   | $39/seat/mo     |
| Cursor               | $20/mo     | $40/seat/mo   | Custom          |
| Windsurf             | $15/mo     | $30/seat/mo   | Custom          |
| Amazon Q Developer   | —          | $19/seat/mo   | Custom          |
| **Mouse (proposed)** | **$10/mo** | —             | **$25/seat/mo** |

Mouse Individual matches Copilot Individual. Mouse Enterprise undercuts Copilot Business while offering complementary value (reliability layer vs. code generation).

---

## 6. Risks and Mitigations

### 6.1 Perceived Value Risk

**Risk:** Low price signals low quality ("you get what you pay for").

**Mitigation:**

- Lead with evidence (p-values, benchmarks)
- Position as "launch pricing" with clear path to higher prices
- Enterprise tier at $25 maintains professional perception
- Open Source tier requires verification (scarcity creates value)

### 6.2 Revenue Ceiling Risk

**Risk:** We lock in low prices and can't raise them later.

**Mitigation:**

- Grandfather existing customers at their purchase price
- New customers pay current rates
- Announce price increases 90 days in advance
- OOXML is a separate product line with separate pricing

### 6.3 Support Cost Risk

**Risk:** High volume at low price overwhelms support capacity.

**Mitigation:**

- Individual tier: Community support (Discord) + email (48hr SLA)
- Enterprise tier: Priority support priced into $25/seat
- Self-service documentation and FAQ
- In-product help and diagnostics

### 6.4 Enterprise Credibility Risk

**Risk:** "If it's only $10/month, is it serious?"

**Mitigation:**

- Enterprise tier exists at $25/seat with SSO, admin console, SLA
- Volume discounts reward commitment, not desperation
- Case studies and testimonials from Individual users who become Enterprise champions

---

## 7. Implementation Considerations

If this pricing change is approved, the following artifacts require updates:

### 7.1 Immediate Updates Required

| Document/System                         | Change Required                               |
| --------------------------------------- | --------------------------------------------- |
| PLG Roadmap                             | New tier structure, updated Stripe products   |
| PLG Technical Specification             | Pricing constants, license policy definitions |
| User Journey & Guest Checkout           | Trial flow differences by tier                |
| Frontend Constants (`lib/constants.js`) | Pricing, tier definitions                     |
| Keygen.sh Policies                      | OSS verification, device limits by tier       |
| Stripe Products                         | New SKUs (6 products instead of 10)           |

### 7.2 Investor Deck Impact

| Section                 | Consideration                                  |
| ----------------------- | ---------------------------------------------- |
| Market sizing           | SAM segmentation (OSS, Individual, Enterprise) |
| Revenue projections     | Updated ARR model with new pricing             |
| Competitive positioning | Price comparison table                         |
| Go-to-market            | Volume-driven vs. enterprise-focused narrative |

### 7.3 Stripe Product Structure (Revised)

**Previous approach (rejected):** 10 products with separate "launch" SKUs and 50% discounts.

**New approach:** Single canonical price ladder with 6 products. Time-boxed promotions via Stripe coupons, not separate SKUs.

```
PRODUCTS (6 total):
mouse_individual_monthly    $10/month
mouse_individual_annual     $100/year (2 months free)
mouse_enterprise_10         $3,000/year (10 seats @ $300/seat)
mouse_enterprise_100        $27,000/year (100 seats @ $270/seat, 10% off)
mouse_enterprise_500        $120,000/year (500 seats @ $240/seat, 20% off)
mouse_enterprise_custom     Custom pricing (1000+ seats, contact sales)

COUPONS (optional, time-boxed):
EARLYADOPTER20              20% off first year (Enterprise annual only)
                            Expires: [TBD based on launch date]

OSS TIER:
No Stripe product — manual license issuance via Keygen.sh
Verification: GitHub API (100+ stars, Sponsors, or NPM/PyPI maintainer)
```

**Why this is better:**

- No SKU sprawl (6 products vs. 10)
- No anchor damage from "50% off" permanent discounts
- Webhook handlers simpler (fewer price IDs to match)
- Grandfathering via customer metadata, not separate products

---

## 8. Reconciliation: Trial and Device Policy

**Issue identified in peer review:** Previous documents had inconsistent trial and device policies.

### 8.1 Trial Policy (Reconciled)

| Tier        | Trial Duration | Credit Card Required? | Rationale                                        |
| ----------- | -------------- | --------------------- | ------------------------------------------------ |
| Open Source | N/A            | N/A                   | Free tier, no trial needed                       |
| Individual  | 14 days        | ❌ No                 | Maximize conversion at $10/mo impulse price      |
| Enterprise  | 30 days        | ✅ Yes                | Filters tire-kickers, matches buyer expectations |

**Correction:** PLG Roadmap previously stated "14-day trial with credit card required" for all tiers. This should be updated to match the above.

### 8.2 Device Limits (Reconciled)

| Tier        | Devices    | Rationale                                          |
| ----------- | ---------- | -------------------------------------------------- |
| Open Source | 1          | Minimal footprint for free tier                    |
| Individual  | 3          | Desktop + laptop + home machine                    |
| Enterprise  | 2 per seat | Governance-friendly, standard for enterprise tools |

**Correction:** PLG Roadmap previously stated "Standard 2 devices, Enterprise 3 devices." This inverts the logic. Individual developers need more flexibility; enterprise buyers prioritize control.

---

## 9. Investor Deck Market Slide Implications

**Issue identified in peer review:** Market slide currently bakes pricing into TAM/SAM calculations, making it fragile to pricing changes.

### 9.1 Recommended Change: Seat-Based Market Sizing

**Current approach (fragile):**

- TAM/SAM expressed in dollars
- Implicitly assumes $50/seat/month
- "50K seats → $30M ARR" math breaks if pricing changes

**Recommended approach (resilient):**

- TAM/SAM expressed in **seats** (developer counts)
- Separate "monetization" callout showing price range
- SOM can flex with pricing without redoing market research

### 9.2 SOM Framing Options

| Option              | SOM Target | ARR Implication       | Investor Narrative                                          |
| ------------------- | ---------- | --------------------- | ----------------------------------------------------------- |
| **A (recommended)** | 50K seats  | ~$10M ARR (beachhead) | "Developer beachhead revenue; OOXML expansion drives $30M+" |
| **B**               | 165K seats | ~$30M ARR             | "Volume-driven model requires higher adoption"              |

**Recommendation:** Option A. It's more credible for an early-stage company to target 50K seats than 165K. The $30M ARR narrative shifts to OOXML expansion (the endgame), which is the story we want to tell anyway.

### 9.3 Market Slide Language Suggestion

```
Before (implicit $50/seat):
"SOM: 50,000 seats × $600/year = $30M ARR"

After (seat-based, pricing-agnostic):
"SOM: 50,000 developer seats (3% of SAM-1)
At launch pricing ($10-25/seat): ~$10M ARR (developer beachhead)
OOXML expansion to knowledge workers: $30M+ ARR potential"
```

This decouples market size from pricing decisions and tells the beachhead → endgame story.

---

## 10. Recommendation

**Approve this pricing structure for PLG implementation.**

The change from premium pricing ($40-50/seat) to volume pricing ($10-25/seat) aligns with:

1. **Strategic positioning** — Mouse as beachhead, not endgame
2. **Market reality** — Price discovery through adoption
3. **Cash flow needs** — Revenue sooner, even if per-seat is lower
4. **Long-term vision** — OOXML is the profit engine; Mouse proves GTM

**Next steps upon approval:**

1. Update PLG Roadmap with new pricing tiers
2. Revise technical specifications (Stripe, Keygen policies)
3. Update user journey documentation
4. Assess investor deck implications (separate memo)
5. Finalize Stripe product configuration

---

## 11. Decision Requested

Please confirm:

- [ ] **Approve** the three-tier structure (Open Source / Individual / Enterprise)
- [ ] **Approve** pricing: $0 / $10/month / $25/seat/month
- [ ] **Approve** volume discounts: 10% at 100 seats, 20% at 500 seats
- [ ] **Authorize** updates to PLG documentation and technical specifications

---

_This memorandum is for internal planning purposes and does not constitute a binding commitment to any pricing structure._
