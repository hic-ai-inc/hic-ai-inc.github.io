# HIC AI Product-Led Growth (PLG) Roadmap

**Document Version:** 2.0  
**Last Updated:** January 22, 2026  
**Owner:** General Counsel  
**Status:** 🟢 ACTIVE

**v2.0 Changes (Pricing Restructure):**

- **New 3-tier structure:** Open Source ($0) / Individual ($10/mo) / Enterprise ($25/seat/mo)
- Removed "launch pricing" SKUs — single canonical price ladder
- Trial policy reconciled: Individual = no card, Enterprise = card required
- Device limits reconciled: Individual = 3, Enterprise = 2/seat
- Simplified to 6 Stripe products (down from 10)
- Use Stripe coupons for time-boxed promos, not separate SKUs
- Break-even math updated for new pricing

**v1.1 Changes (Infrastructure):**

- Hosting changed from Vercel to AWS Amplify
- Added Welcome page for account creation tie-in
- Renamed Dashboard to Portal with expanded pages
- Added GSI3 for Auth0 user lookup
- Changed from TypeScript to JavaScript

---

## Executive Summary

This roadmap outlines the complete path from MVP to mature PLG-driven self-service sales pipeline for Mouse. The strategy enables customers at any scale—from individual developers to Fortune 500 procurement teams—to purchase, install, and onboard without human intervention.

**North Star Metric:** Time-to-Value < 60 seconds

**Key Milestones:**

- **MVP Launch (Week 2):** Self-service purchase → license → install flow
- **Polish & Docs (Week 3-4):** Documentation, landing page optimization
- **Growth Phase (Month 3-6):** Enterprise self-service at scale
- **Maturity Phase (Month 6-12):** Full PLG flywheel with product-qualified leads

**MVP Sprint Focus (2 weeks):** Payment → license → activate. Defer enterprise SSO, team management, and advanced analytics to post-MVP phases.

---

## Phase 0: Foundation (Weeks 1-2)

**Objective:** Establish accounts, apply for startup credits, configure third-party services

### 0.1 Startup Credits & Discount Programs

| Program                    | Credits Available  | Eligibility                                  | Application URL                                 | Status                        |
| -------------------------- | ------------------ | -------------------------------------------- | ----------------------------------------------- | ----------------------------- |
| **AWS Activate Founders**  | $1,000             | Self-funded, pre-Series B                    | https://aws.amazon.com/startups/credits         | ✅ Applied (Jan 22, 2026)     |
| **AWS Activate Portfolio** | Up to $100,000     | VC-backed (need Org ID from investor)        | https://aws.amazon.com/startups/credits         | ⬜ After funding              |
| **Google Cloud Startups**  | Up to $350,000     | Seed to Series A (AI-first = higher credits) | https://cloud.google.com/startup/apply          | ⬜ Apply                      |
| **Microsoft for Startups** | Up to $150,000     | Pre-seed to Series A (need investor code)    | https://foundershub.startups.microsoft.com      | ⬜ Apply                      |
| **Microsoft Azure Free**   | $5,000             | No investor required                         | https://go.microsoft.com/fwlink/?linkid=2312920 | ⬜ Apply                      |
| **Auth0 Startup Program**  | 1 year free        | Startups                                     | https://auth0.com/startups                      | ✅ Applied (Jan 22, 2026)     |
| **Stripe Atlas**           | Fee discount       | Delaware C-Corp                              | https://stripe.com/atlas                        | ⬜ N/A (already incorporated) |
| **AWS Amplify**            | Pay-as-you-go      | Everyone                                     | https://aws.amazon.com/amplify/                 | ⬜ Standard                   |
| **Keygen.sh**              | $0 (first 99 ALUs) | Everyone                                     | https://keygen.sh/pricing                       | ⬜ Standard                   |

**Priority Order for Applications:**

1. ✅ Auth0 Startup Program (1 year free = $276+ savings)
2. ✅ AWS Activate Founders ($1,000 immediately)
3. ✅ Microsoft Azure Free Trial ($5,000 immediately)
4. ✅ Google Cloud Startups (up to $350,000 for AI startups)
5. 🔜 AWS Activate Portfolio (after investor Org ID)
6. 🔜 Microsoft Investor Network (after investor referral code)

**Total Potential Credits:** Up to $506,000 (with investor backing)  
**Immediately Available (Self-Funded):** ~$6,000 + 1 year Auth0

### 0.2 Third-Party Service Setup

| Service       | Purpose                        | Account Type          | Est. Time         | Status        |
| ------------- | ------------------------------ | --------------------- | ----------------- | ------------- |
| **Auth0**     | Authentication & Organizations | Free (Startup banked) | Instant           | ✅ Configured |
| **Stripe**    | Billing & Subscriptions        | Standard (sandbox)    | Instant           | ✅ Created    |
| **Keygen.sh** | License Management             | Free (99 ALUs)        | Instant           | ✅ Created    |
| **Amplify**   | Website Hosting                | Pay-as-you-go         | Instant           | ⬜            |
| **AWS**       | DynamoDB, Lambda, API Gateway  | Activate Founders     | 5-7 days approval | ✅ Applied    |

### 0.3 Security Documentation

| Document                        | Purpose                                                 | Status      |
| ------------------------------- | ------------------------------------------------------- | ----------- |
| Next.js Security Considerations | Server/client separation, env vars, OWASP/CWE alignment | ✅ Complete |
| Stripe Payments Security        | PCI compliance, webhooks, API keys, fraud prevention    | ✅ Complete |
| Keygen Licensing Security       | License keys, machine activation, offline validation    | ✅ Complete |
| Auth0 Integration Security      | OAuth flows, session management, Organizations          | ✅ Complete |

### 0.4 Domain & Email Verification

| Task                                             | Notes                         | Status |
| ------------------------------------------------ | ----------------------------- | ------ |
| Verify hic-ai.com ownership in Auth0             | Required for custom domain    | ⬜     |
| Configure DMARC/DKIM/SPF for transactional email | Stripe receipts, Auth0 emails | ⬜     |
| Set up support@hic-ai.com forwarding             | Customer support inbox        | ⬜     |

---

## Phase 1: MVP Infrastructure (Weeks 3-4)

**Objective:** Build core purchase → license → install flow

### 1.1 Stripe Configuration

| Task                             | Description                           | Est. Hours | Status |
| -------------------------------- | ------------------------------------- | ---------- | ------ |
| Create Stripe Products           | 6 products (3 tiers, see below)       | 1 hr       | ⬜     |
| Configure Stripe Coupons         | EARLYADOPTER20 for time-boxed promos  | 0.5 hr     | ⬜     |
| Set up Stripe Checkout           | Embedded checkout with seat selection | 4 hrs      | ⬜     |
| Configure Stripe Customer Portal | Self-service billing management       | 2 hrs      | ⬜     |
| Implement Stripe Webhooks        | 5 events (see GC memo Section II.B)   | 4 hrs      | ⬜     |
| Enable Stripe Radar              | Fraud prevention for large purchases  | 1 hr       | ⬜     |

**Stripe Products (6 total):**

```
PRODUCTS:
mouse_individual_monthly    $10/month
mouse_individual_annual     $100/year (2 months free)
mouse_enterprise_10         $3,000/year (10 seats @ $300/seat)
mouse_enterprise_100        $27,000/year (100 seats @ $270/seat, 10% off)
mouse_enterprise_500        $120,000/year (500 seats @ $240/seat, 20% off)
mouse_enterprise_custom     Custom pricing (1000+ seats)

COUPONS (optional, time-boxed):
EARLYADOPTER20              20% off first year (Enterprise only)

OSS TIER:
No Stripe product — manual license issuance via Keygen.sh
```

**Pricing Summary:**

| Tier        | Price                | Trial   | Card Required? | Devices |
| ----------- | -------------------- | ------- | -------------- | ------- |
| Open Source | $0/mo                | N/A     | N/A            | 1       |
| Individual  | $10/mo ($100/yr)     | 14 days | ❌ No          | 3       |
| Enterprise  | $25/seat/mo (annual) | 30 days | ✅ Yes         | 2/seat  |

### 1.2 Keygen.sh Configuration

| Task                        | Description                                  | Est. Hours | Status |
| --------------------------- | -------------------------------------------- | ---------- | ------ |
| Create Keygen Account       | Starter plan ($99/mo)                        | 0.5 hr     | ⬜     |
| Define License Policies     | OSS (1), Individual (3), Enterprise (2/seat) | 2 hrs      | ⬜     |
| Configure Heartbeat         | 24-hour validation interval                  | 1 hr       | ⬜     |
| Set up Keygen Webhooks      | License lifecycle events                     | 2 hrs      | ⬜     |
| Configure OSS Verification  | GitHub API integration for eligibility       | 2 hrs      | ⬜     |
| Test License Validation API | Integration with Mouse extension             | 4 hrs      | ⬜     |

**Keygen Policies:**

```yaml
mouse_oss:
  maxMachines: 1
  floating: false
  heartbeatDuration: 86400
  metadata:
    tier: oss
    commercial_use: false
    verification_required: true # GitHub API check

mouse_individual:
  maxMachines: 3
  floating: true
  heartbeatDuration: 86400
  heartbeatCullStrategy: DEACTIVATE_OLDEST
  metadata:
    tier: individual
    commercial_use: true

mouse_enterprise:
  maxMachines: 2 # Per seat
  floating: true
  heartbeatDuration: 86400
  heartbeatCullStrategy: DEACTIVATE_OLDEST
  metadata:
    tier: enterprise
    commercial_use: true
    sso_enabled: true
```

### 1.3 Auth0 Configuration

| Task                       | Description                        | Est. Hours | Status      |
| -------------------------- | ---------------------------------- | ---------- | ----------- |
| Apply for Startup Program  | Free tier now, Startup banked      | 0.5 hr     | ✅ Complete |
| Create Auth0 Tenant        | dev-vby1x2u5b7c882n5.us.auth0.com  | 1 hr       | ✅ Created  |
| Configure Universal Login  | Branded login page                 | 2 hrs      | ⬜          |
| Enable Social Connections  | Google, GitHub OAuth               | 1 hr       | ⬜          |
| Configure Organizations    | Multi-tenancy for enterprise       | 4 hrs      | ⬜          |
| Set up Roles & Permissions | Owner, Admin, Member               | 2 hrs      | ⬜          |
| Implement Domain Detection | Tier auto-assignment (edu/org/gov) | 2 hrs      | ⬜          |

### 1.4 AWS Infrastructure (DynamoDB + Lambda)

| Task                             | Description                           | Est. Hours | Status              |
| -------------------------------- | ------------------------------------- | ---------- | ------------------- |
| Apply for AWS Activate           | $1,000 credits                        | 0.5 hr     | ✅ Applied (Jan 22) |
| Create DynamoDB Table            | Single-table design per Q's schema    | 2 hrs      | ⬜                  |
| Create GSI1 (Stripe lookup)      | Stripe Customer ID → Customer         | 1 hr       | ⬜                  |
| Create GSI2 (License lookup)     | License Key → Customer (KEYGEN#)      | 1 hr       | ⬜                  |
| Create GSI3 (Auth0 lookup)       | Auth0 User ID → Customer              | 1 hr       | ⬜                  |
| Deploy Stripe Webhook Lambda     | Process checkout, subscription events | 4 hrs      | ⬜                  |
| Deploy Keygen Webhook Lambda     | Process license lifecycle events      | 2 hrs      | ⬜                  |
| Deploy License Validation Lambda | High-frequency validation endpoint    | 4 hrs      | ⬜                  |
| Configure API Gateway            | REST API for webhooks + validation    | 2 hrs      | ⬜                  |
| Set up CloudWatch Alarms         | Throttling, errors, latency           | 2 hrs      | ⬜                  |

---

## Phase 2: Website MVP (Weeks 5-6)

**Objective:** Build Next.js website with purchase flow

### 2.1 Next.js Project Setup

| Task                          | Description                      | Est. Hours | Status |
| ----------------------------- | -------------------------------- | ---------- | ------ |
| Initialize Next.js 14 project | App Router, JavaScript, Tailwind | 2 hrs      | ⬜     |
| Configure Amplify deployment  | Production + preview branches    | 1 hr       | ⬜     |
| Set up Auth0 SDK              | @auth0/nextjs-auth0 SDK          | 4 hrs      | ⬜     |
| Set up Stripe SDK             | @stripe/stripe-js + server-side  | 2 hrs      | ⬜     |
| Environment configuration     | Development, staging, production | 1 hr       | ⬜     |

### 2.2 Landing Page (/)

| Task                     | Description                                 | Est. Hours | Status |
| ------------------------ | ------------------------------------------- | ---------- | ------ |
| Hero section             | "First Proven Treatment for Execution Slop" | 4 hrs      | ⬜     |
| Problem/Solution section | Pain points + Mouse solution                | 4 hrs      | ⬜     |
| Evidence section         | Stats with p-values, credibility            | 4 hrs      | ⬜     |
| Social proof section     | Testimonials (placeholder)                  | 2 hrs      | ⬜     |
| CTA section              | "Get Started" button                        | 1 hr       | ⬜     |
| Footer                   | Links, legal, social                        | 2 hrs      | ⬜     |

### 2.3 Pricing Page (/pricing)

| Task                       | Description                         | Est. Hours | Status |
| -------------------------- | ----------------------------------- | ---------- | ------ |
| Tier comparison table      | 3 tiers (OSS/Individual/Enterprise) | 4 hrs      | ⬜     |
| OSS eligibility checker    | GitHub verification flow            | 2 hrs      | ⬜     |
| Annual vs Monthly toggle   | Real-time price update (Individual) | 2 hrs      | ⬜     |
| Enterprise seat calculator | Volume discount display             | 2 hrs      | ⬜     |
| FAQ section                | Common pricing questions            | 2 hrs      | ⬜     |
| CTA to checkout            | "Get Started" per tier              | 1 hr       | ⬜     |

### 2.4 Checkout Flow (/checkout)

| Task                        | Description                         | Est. Hours | Status |
| --------------------------- | ----------------------------------- | ---------- | ------ |
| Seat selector component     | Quantity input (Enterprise 10+ min) | 2 hrs      | ⬜     |
| Volume discount display     | Show 10%/20% off at thresholds      | 1 hr       | ⬜     |
| Real-time price calculator  | Live total as inputs change         | 2 hrs      | ⬜     |
| Stripe Checkout integration | Redirect to Stripe-hosted page      | 4 hrs      | ⬜     |
| Trial flow (Individual)     | 14 days, no card required           | 2 hrs      | ⬜     |
| Trial flow (Enterprise)     | 30 days, card required              | 2 hrs      | ⬜     |
| Success redirect handler    | /welcome → account creation         | 2 hrs      | ⬜     |

### 2.5 Welcome Page (/welcome)

| Task                      | Description                          | Est. Hours | Status |
| ------------------------- | ------------------------------------ | ---------- | ------ |
| Session verification      | Retrieve Stripe session, validate    | 2 hrs      | ⬜     |
| Account creation form     | Password fields + social SSO buttons | 4 hrs      | ⬜     |
| Auth0 user creation API   | /api/auth/complete-signup endpoint   | 4 hrs      | ⬜     |
| License reveal component  | Display key after account created    | 2 hrs      | ⬜     |
| Welcome email trigger     | Send license key + onboarding        | 2 hrs      | ⬜     |
| Abandoned signup recovery | 1-hour reminder email for incomplete | 2 hrs      | ⬜     |

### 2.6 Customer Portal (/portal)

| Task                             | Description                            | Est. Hours | Status |
| -------------------------------- | -------------------------------------- | ---------- | ------ |
| Portal layout                    | Authenticated shell with sidebar       | 4 hrs      | ⬜     |
| Dashboard page (/portal)         | Overview, trial countdown, quick stats | 4 hrs      | ⬜     |
| License page (/portal/license)   | View key, copy, regenerate if needed   | 2 hrs      | ⬜     |
| Devices page (/portal/devices)   | View activations, deactivate old       | 4 hrs      | ⬜     |
| Billing page (/portal/billing)   | Stripe Customer Portal redirect        | 2 hrs      | ⬜     |
| Invoices page (/portal/invoices) | Invoice history, PDF download          | 2 hrs      | ⬜     |
| Settings page (/portal/settings) | Change password, email prefs           | 2 hrs      | ⬜     |
| Team management (enterprise)     | /portal/team - invite, remove, roles   | 8 hrs      | ⬜     |

---

## Phase 3: Extension Integration (Weeks 7-8)

**Objective:** Add license validation to Mouse extension

### 3.1 License Validation in Extension

| Task                             | Description                       | Est. Hours | Status |
| -------------------------------- | --------------------------------- | ---------- | ------ |
| Add license key setting          | VS Code settings.json integration | 2 hrs      | ⬜     |
| Implement machine fingerprinting | Unique device identifier          | 4 hrs      | ⬜     |
| Build validation client          | Keygen.sh API integration         | 4 hrs      | ⬜     |
| Implement phone-home logic       | 24-hour validation interval       | 2 hrs      | ⬜     |
| Cache validation result          | Offline grace period support      | 2 hrs      | ⬜     |
| Graceful degradation             | Feature limiting by license state | 4 hrs      | ⬜     |

### 3.2 License States & UX

| State         | Trigger                    | User Experience                      |
| ------------- | -------------------------- | ------------------------------------ |
| **ACTIVE**    | Valid license              | Full functionality                   |
| **EXPIRING**  | 7 days to expiration       | Banner warning, full features        |
| **GRACE**     | Expired < 14 days          | Limited features, persistent warning |
| **SUSPENDED** | Payment failed             | Read-only mode                       |
| **DISABLED**  | Expired 14+ days / Revoked | "Renew" prompt only                  |

### 3.3 PLG Installer Enhancement

| Task                        | Description                             | Est. Hours | Status |
| --------------------------- | --------------------------------------- | ---------- | ------ |
| Update npx installer        | Support license key input               | 4 hrs      | ⬜     |
| Add "Get License" prompt    | Redirect to hic-ai.com if no key        | 2 hrs      | ⬜     |
| Implement offline detection | Handle no-network scenarios             | 2 hrs      | ⬜     |
| End-to-end testing          | Full flow: website → install → validate | 4 hrs      | ⬜     |

---

## Phase 4: Polish & Launch (Weeks 9-10)

**Objective:** Production-ready PLG system

### 4.1 Documentation Site (/docs)

| Task                  | Description                              | Est. Hours | Status |
| --------------------- | ---------------------------------------- | ---------- | ------ |
| Getting Started guide | End-to-end setup walkthrough             | 4 hrs      | ⬜     |
| Installation guide    | All platforms (npm, npx, manual)         | 4 hrs      | ⬜     |
| Tool Reference        | All 10 Mouse tools documented            | 8 hrs      | ⬜     |
| FAQ                   | Common issues and solutions              | 4 hrs      | ⬜     |
| API Reference         | License validation API (for integrators) | 4 hrs      | ⬜     |

### 4.2 Landing Page Optimization

| Task                     | Description             | Est. Hours | Status |
| ------------------------ | ----------------------- | ---------- | ------ |
| Copywriting review       | Professional polish     | 4 hrs      | ⬜     |
| Mobile responsiveness    | Full mobile support     | 4 hrs      | ⬜     |
| Performance optimization | Core Web Vitals targets | 4 hrs      | ⬜     |
| A/B test setup           | Headline variants       | 2 hrs      | ⬜     |

### 4.3 Launch Checklist

| Task                          | Description                   | Status |
| ----------------------------- | ----------------------------- | ------ |
| SSL verified (hic-ai.com)     | HTTPS everywhere              | ⬜     |
| Error monitoring (Sentry)     | Production error tracking     | ⬜     |
| Analytics (Plausible/PostHog) | Privacy-friendly analytics    | ⬜     |
| Legal pages live              | Terms, Privacy Policy, EULA   | ⬜     |
| Stripe live mode              | Production payment processing | ⬜     |
| Support email configured      | support@hic-ai.com responsive | ⬜     |
| Backup/recovery tested        | Data restoration procedures   | ⬜     |

---

## Phase 5: Growth (Months 3-6)

**Objective:** Scale self-service, add enterprise features

### 5.1 Enterprise Self-Service Features

| Feature                | Description                      | Priority  | Status |
| ---------------------- | -------------------------------- | --------- | ------ |
| PO/Invoice Payment     | Net-30 for 100+ seats            | 🔥 HIGH   | ⬜     |
| SSO (SAML/OIDC)        | Enterprise identity federation   | 🔥 HIGH   | ⬜     |
| Bulk Seat Provisioning | API for HR/IT systems            | 🟡 MEDIUM | ⬜     |
| Usage Reporting        | Admin dashboard with analytics   | 🟡 MEDIUM | ⬜     |
| Domain Claiming        | Auto-join for @company.com users | 🟡 MEDIUM | ⬜     |

### 5.2 Product-Qualified Leads (PQL) System

| Signal                      | Trigger                     | Action                      |
| --------------------------- | --------------------------- | --------------------------- |
| 5+ users from same domain   | Detected on signup          | Send "Team Plan" email      |
| 20+ seats purchased         | Checkout completed          | Assign CSM                  |
| Fortune 500 domain          | Signup detected             | High-touch onboarding email |
| 100+ seat enterprise signup | Checkout completed          | Personal founder email      |
| Usage spike                 | Device activations increase | "Need more seats?" email    |

### 5.3 Telemetry & Analytics

| Metric               | Collection Method   | Purpose                |
| -------------------- | ------------------- | ---------------------- |
| Tool usage frequency | Phone-home data     | Product improvement    |
| Error rates by tool  | Extension telemetry | Quality monitoring     |
| Session duration     | Extension telemetry | Engagement measurement |
| Feature adoption     | Extension telemetry | Roadmap prioritization |

---

## Phase 6: Maturity (Months 6-12)

**Objective:** Full PLG flywheel, expand product line

### 6.1 Enterprise Pilot Program

| Component                  | Description            | Status |
| -------------------------- | ---------------------- | ------ |
| Pilot request form         | Website intake         | ⬜     |
| Qualification criteria     | Company size, use case | ⬜     |
| Pilot license provisioning | 30-day, up to 50 seats | ⬜     |
| Success metrics tracking   | Adoption, satisfaction | ⬜     |
| Conversion workflow        | Pilot → paid contract  | ⬜     |

### 6.2 SEO & Content Engine

| Week | Content                         | Target Keyword                |
| ---- | ------------------------------- | ----------------------------- |
| 1    | "What is Execution Slop?"       | execution slop                |
| 2    | "Why AI Coding Assistants Fail" | AI code assistant reliability |
| 4    | "Mouse vs Find-Replace"         | AI file editing               |
| 6    | "Benchmarking AI Code Editors"  | AI coding benchmarks          |
| 8    | Case Study: "[Company] Results" | AI coding assistant errors    |
| 10   | "Hidden Cost of AI Corruption"  | Copilot file corruption       |
| 12   | Technical Paper Release         | execution slop research       |

### 6.3 Distribution Channels

| Channel     | Content Type            | Frequency |
| ----------- | ----------------------- | --------- |
| Hacker News | Launch, deep dives      | Monthly   |
| Twitter/X   | Insights, engagement    | Daily     |
| Reddit      | r/programming, r/vscode | Weekly    |
| Dev.to      | Mirror blog content     | Weekly    |
| YouTube     | Demo videos             | Bi-weekly |
| LinkedIn    | Enterprise content      | Weekly    |

### 6.4 Future Product Line Expansion

| Product            | Description                    | PLG Integration              |
| ------------------ | ------------------------------ | ---------------------------- |
| **Notepad**        | Persistent notes for AI agents | Add-on to Mouse subscription |
| **Morning Coffee** | Daily standup intelligence     | Separate subscription        |
| **Chat**           | Multi-agent collaboration      | Enterprise tier only         |

---

## Success Metrics

### Launch Metrics (Week 10)

| Metric                        | Target       |
| ----------------------------- | ------------ |
| Website live                  | ✅           |
| Self-service purchase working | ✅           |
| License validation working    | ✅           |
| Time to first install         | < 60 seconds |

### 90-Day Metrics

| Metric                 | Target              |
| ---------------------- | ------------------- |
| Website visitors       | 10,000              |
| Signups                | 500                 |
| Paid conversions       | 50 (10% conversion) |
| MRR                    | $2,000+             |
| Team accounts          | 5                   |
| Average seats per team | 5                   |

### 6-Month Metrics

| Metric                            | Target   |
| --------------------------------- | -------- |
| MRR                               | $10,000+ |
| Enterprise accounts (20+ seats)   | 3        |
| Self-service enterprise purchases | 80%+     |
| Support tickets per customer      | < 1      |

### 12-Month Metrics

| Metric                | Target     |
| --------------------- | ---------- |
| ARR                   | $250,000+  |
| Enterprise accounts   | 10+        |
| Net Revenue Retention | 110%+      |
| CAC Payback           | < 6 months |

---

## Cost Summary

### Fixed Monthly Costs

| Service            | Cost             | Notes                       |
| ------------------ | ---------------- | --------------------------- |
| Auth0              | $0               | Startup program (Year 1)    |
| Keygen.sh          | $0               | Free tier (first 99 ALUs)   |
| AWS Amplify        | ~$5-20           | Pay-as-you-go (low traffic) |
| Google Workspace   | $7               | Business Starter            |
| Domain (amortized) | $2               | Annual ÷ 12                 |
| **Total**          | **~$113-128/mo** |                             |

### Variable Costs

| Service | Cost             | Notes                                |
| ------- | ---------------- | ------------------------------------ |
| Stripe  | 2.9% + $0.30/txn | Per transaction                      |
| AWS     | ~$1/mo           | DynamoDB + Lambda (with credits: $0) |

### Break-Even

- At ~$120/mo fixed costs
- At Individual pricing ($10/mo): **12 customers**
- At Enterprise pricing ($25/seat × 10 seats = $250/mo): **1 Enterprise account**
- Blended (5 Individual + 1 Enterprise 10-seat): **$300/mo** = break-even + margin

**Path to $1M ARR:**

- 8,334 Individual seats @ $10/mo = $1M ARR
- OR 3,334 Enterprise seats @ $25/mo = $1M ARR
- OR blended: 5,000 Individual + 1,500 Enterprise = $1M ARR

---

## Risk Register

| Risk               | Likelihood       | Impact | Mitigation                                      |
| ------------------ | ---------------- | ------ | ----------------------------------------------- |
| Code piracy        | Medium           | Low    | Obfuscation, license validation, brand value    |
| Stripe fraud       | Low              | Medium | Enable Radar, verify large purchases            |
| License sharing    | Medium           | Low    | Device limits, machine fingerprinting           |
| Auth0 program ends | Certain (Year 2) | Low    | Budget $23/mo Essential tier                    |
| Keygen.sh outage   | Low              | High   | Cache validation, 14-day grace period           |
| Competitor clones  | Medium           | Medium | Speed, patents, brand, enterprise relationships |

---

## Appendices

### A. Related Documents

**v2 Technical Specifications (Current):**

- [PLG Technical Specification v2](20260122_GC_PLG_TECHNICAL_SPECIFICATION_v2.md) — Complete system architecture, updated pricing
- [API Route Map v2](20260122_GC_API_MAP_FOR_HIC_AI_WEBSITE_v2.md) — All API endpoints with Auth0 integration
- [User Journey & Guest Checkout v2](20260122_GC_USER_JOURNEY_AND_GUEST_CHECKOUT_v2.md) — End-to-end user flow with account creation tie-in
- [Frontend Foundation v2](20260122_GC_NEXTJS_FRONTEND_FOUNDATION_v2.md) — Design system and project setup

**Pricing Decision:**

- [Proposed Pricing Changes](20260122_GC_PROPOSED_PRICING_CHANGES_FOR_PLG_IMPLEMENTATION.md) — Rationale for $0/$10/$25 pricing

**v1 Archives (Superseded):**

- [PLG Technical Specification v1](20260121_GC_PLG_TECHNICAL_SPECIFICATION.md)
- [API Route Map v1](20260121_GC_API_MAP_FOR_HIC_AI_WEBSITE.md)
- [User Journey v1](20260121_GC_USER_JOURNEY_AND_GUEST_CHECKOUT.md)
- [DynamoDB Schema Addendum](20260121_GC_DDB_SCHEMA_ADDENDUM.md) — Schema reconciliation (still current)

**Strategy & Schema:**

- [PLG Strategy Memo](20260121_GC_PRODUCT_LED_GROWTH_STRATEGY_FOR_HIC_AI.md)
- [Data Schema Memo (Q)](20260121_Q_SCHEMA_AND_DATA_STRUCTURE_FOR_PLG_WEB_DESIGN.md)

**Installation & Packaging:**

- [PLG Installer Build Checklist](../../packaging/docs/PLG_INSTALLER_BUILD_CHECKLIST.md)
- [PLG Installation UX Strategy](../../packaging/docs/20260119_GC_PRODUCT_LED_GROWTH_INSTALLATION_UX_STRATEGY_MEMO.md)

**Security Documentation:**

- [Security Considerations for Next.js](20260122_SECURITY_CONSIDERATIONS_FOR_NEXTJS_PROJECT.md) — Server/client separation, env vars, OWASP/CWE alignment
- [Security Considerations for Stripe](20260122_SECURITY_CONSIDERATIONS_FOR_STRIPE_PAYMENTS.md) — PCI compliance, webhooks, API keys, fraud prevention
- [Security Considerations for Keygen](20260122_SECURITY_CONSIDERATIONS_FOR_KEYGEN_LICENSING.md) — License keys, machine activation, offline validation
- [Security Considerations for Auth0](20260122_SECURITY_CONSIDERATIONS_FOR_AUTH0_INTEGRATION.md) — OAuth 2.1/PKCE, session management, Organizations, RBAC

### B. Startup Credit Application Checklist

| Program                        | Requirements                               | Documents Needed         |
| ------------------------------ | ------------------------------------------ | ------------------------ |
| **AWS Activate Founders**      | Self-funded, pre-Series B, company website | EIN, Company URL         |
| **AWS Activate Portfolio**     | VC-backed, need Org ID                     | Org ID from investor     |
| **Google Cloud Startups**      | Seed to Series A, founded < 10 years       | Company info, pitch deck |
| **Microsoft Azure Free**       | New Azure customer                         | Microsoft Account        |
| **Microsoft Investor Network** | Pre-seed to Series A                       | Investor referral code   |
| **Auth0 Startups**             | Startup status                             | Company info             |

### C. Weekly Checkpoint Template

```markdown
## PLG Roadmap Weekly Checkpoint

**Week:** X of 10
**Date:** YYYY-MM-DD

### Completed This Week

- [ ] Task 1
- [ ] Task 2

### Blocked Items

- Issue: [description]
  - Blocker: [what's blocking]
  - Resolution path: [how to unblock]

### Next Week Focus

- [ ] Task 1
- [ ] Task 2

### Metrics

- Website visitors: X
- Signups: X
- Conversions: X
```

---

_This roadmap is a living document and will be updated as progress is made._
