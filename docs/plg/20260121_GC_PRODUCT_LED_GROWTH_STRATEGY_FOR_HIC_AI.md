# MEMORANDUM

**TO:** Simon Reiff, President & Technical Founder  
**FROM:** General Counsel  
**DATE:** January 21, 2026  
**RE:** Product-Led Growth Strategy for HIC AI, Inc.

---

## Executive Summary

This memo outlines the technical architecture and business strategy for HIC AI's product-led growth (PLG) approach to commercializing Mouse. The strategy combines self-service purchasing at all scales (individual to enterprise) with a complementary enterprise pilot program, using Stripe for payments, Keygen.sh for license management, and Auth0 for authentication.

**Core Principle:** A developer at a Fortune 500 company should be able to purchase 1,000 seats at 2:00 AM without ever speaking to a human.

---

## I. Pricing Architecture

### Tier Structure

| Tier           | Monthly Price | Detection Method               | Use Case                            |
| -------------- | ------------- | ------------------------------ | ----------------------------------- |
| **Academic**   | $20/seat      | `.edu` email domain            | Universities, students, researchers |
| **Nonprofit**  | $20/seat      | `.org` email domain            | 501(c)(3) organizations             |
| **Government** | $30/seat      | `.gov` / `.mil` email domain   | Federal, state, local agencies      |
| **Individual** | $40/seat      | Default (single-seat accounts) | Solo developers, freelancers        |
| **Enterprise** | $50/seat      | Organizations with 2+ seats    | Companies, teams                    |

### Volume Considerations

- **Annual billing discount:** 15% (2 months free)
- **Concurrent devices per seat:** 2 (configurable)
- **Minimum enterprise commitment:** None (self-service at any scale)
- **Custom enterprise pricing:** Available for 500+ seats (contact sales)

---

## II. Technical Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           HIC AI WEBSITE                                 │
│                         (Next.js + Vercel)                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────────┐ │
│   │   Landing   │    │   Pricing   │    │      Customer Dashboard     │ │
│   │    Page     │───▶│    Page     │───▶│   - Subscription mgmt       │ │
│   │             │    │             │    │   - Org/team admin          │ │
│   └─────────────┘    └─────────────┘    │   - License keys            │ │
│                                          │   - Usage analytics         │ │
│                                          └─────────────────────────────┘ │
│                                                       │                  │
└───────────────────────────────────────────────────────│──────────────────┘
                                                        │
                    ┌───────────────────────────────────┼───────────────────┐
                    │                                   │                   │
                    ▼                                   ▼                   ▼
            ┌─────────────┐                   ┌─────────────┐      ┌─────────────┐
            │   Auth0     │                   │   Stripe    │      │  Keygen.sh  │
            │             │                   │   Billing   │      │  Licensing  │
            │ - Signup    │                   │             │      │             │
            │ - Login     │                   │ - Checkout  │      │ - Keys      │
            │ - SSO       │                   │ - Subs mgmt │      │ - Devices   │
            │ - MFA       │                   │ - Invoices  │      │ - Validate  │
            │ - Orgs      │                   │ - Webhooks  │      │ - Policies  │
            └─────────────┘                   └─────────────┘      └─────────────┘
                    │                                   │                   │
                    │                                   │                   │
                    └───────────────────────────────────┴───────────────────┘
                                                        │
                                                        ▼
                                          ┌─────────────────────────┐
                                          │     Mouse Extension     │
                                          │       (VS Code)         │
                                          │                         │
                                          │  - License validation   │
                                          │  - Device registration  │
                                          │  - Phone-home (daily)   │
                                          │  - Graceful degradation │
                                          └─────────────────────────┘
```

### Component Details

#### A. Auth0 (Authentication & Organizations)

**Why Auth0:**

- 1-year free startup program
- Native organization/multi-tenancy support
- Enterprise SSO (SAML, OIDC) for large customers
- MFA built-in
- Extensive AI/ML identity features roadmap

**Configuration:**

```
Auth0 Features Required:
├── Universal Login (branded)
├── Organizations (for team accounts)
├── Connections
│   ├── Email/Password
│   ├── Google OAuth
│   ├── GitHub OAuth
│   └── Enterprise SSO (SAML) [for enterprise tier]
├── MFA (optional, enterprise tier)
└── Roles
    ├── Owner (billing, all admin)
    ├── Admin (user management)
    └── Member (standard user)
```

**Domain-Based Tier Detection:**

- On signup, extract email domain
- Check against known TLD patterns (`.edu`, `.org`, `.gov`, `.mil`)
- Auto-assign pricing tier
- Store tier in Auth0 user metadata

#### B. Stripe (Billing & Subscriptions)

**Why Stripe:**

- Industry standard for SaaS billing
- Native subscription management
- Customer Portal (self-service billing management)
- Webhooks for lifecycle events
- Handles proration, upgrades, downgrades automatically

**Stripe Products:**

```
Products:
├── mouse_academic_monthly      ($20/seat/mo)
├── mouse_academic_annual       ($204/seat/yr - 15% discount)
├── mouse_nonprofit_monthly     ($20/seat/mo)
├── mouse_nonprofit_annual      ($204/seat/yr)
├── mouse_government_monthly    ($30/seat/mo)
├── mouse_government_annual     ($306/seat/yr)
├── mouse_individual_monthly    ($40/seat/mo)
├── mouse_individual_annual     ($408/seat/yr)
├── mouse_enterprise_monthly    ($50/seat/mo)
└── mouse_enterprise_annual     ($510/seat/yr)
```

**Checkout Flow:**

1. User selects tier (auto-detected or manual)
2. User selects seat count
3. User selects billing frequency (monthly/annual)
4. Stripe Checkout Session created
5. Payment processed
6. Webhook triggers license creation in Keygen.sh
7. User redirected to dashboard with license key

**Webhooks to Handle:**

- `checkout.session.completed` → Create license
- `customer.subscription.updated` → Adjust seat count
- `customer.subscription.deleted` → Revoke license
- `invoice.payment_failed` → Mark license as past due
- `invoice.paid` → Restore license status

#### C. Keygen.sh (License Management)

**Why Keygen.sh:**

- Purpose-built for software licensing
- Device fingerprinting and limits
- Offline grace periods
- Policy-based validation
- REST API for extension integration

**Keygen Policy Configuration:**

```
Policies:
├── mouse_standard
│   ├── maxMachines: 2 (concurrent devices)
│   ├── floating: true
│   ├── requireHeartbeat: true
│   ├── heartbeatDuration: 86400 (24 hours)
│   ├── heartbeatCullStrategy: DEACTIVATE_OLDEST
│   └── expirationStrategy: RESTRICT_ACCESS
│
└── mouse_enterprise
    ├── maxMachines: 3 (concurrent devices)
    ├── floating: true
    ├── requireHeartbeat: true
    ├── heartbeatDuration: 86400 (24 hours)
    └── ... (same as above)
```

**License Lifecycle:**

```
License States:
├── ACTIVE      → Full functionality
├── EXPIRING    → 7 days until expiration (show warning)
├── EXPIRED     → Grace period (14 days, limited functionality)
├── SUSPENDED   → Payment failed (read-only mode)
└── REVOKED     → Subscription cancelled (disabled)
```

**Device Management:**

- On first activation, extension sends machine fingerprint
- Keygen registers device against license
- If device limit exceeded, oldest device deactivated (floating)
- User can manually deactivate devices in dashboard

#### D. Mouse Extension Integration

**Phone-Home Logic:**

```javascript
// Pseudocode for extension license validation
async function validateLicense() {
  const licenseKey = getLicenseKeyFromSettings();
  const machineFingerprint = generateMachineFingerprint();

  try {
    const response = await keygen.validateLicense({
      key: licenseKey,
      fingerprint: machineFingerprint,
    });

    if (response.valid) {
      enableFullFunctionality();
      scheduleNextValidation(24 * 60 * 60 * 1000); // 24 hours
    } else {
      handleInvalidLicense(response.code);
    }
  } catch (networkError) {
    // Offline: check local cache
    if (cachedValidation.isWithinGracePeriod()) {
      enableFullFunctionality();
    } else {
      enableGracefulDegradation();
    }
  }
}
```

**Graceful Degradation Stages:**
| Stage | Trigger | Behavior |
|-------|---------|----------|
| **Full** | Valid license | All features enabled |
| **Warning** | 7 days to expiration | Banner notification, full features |
| **Grace** | Expired, within 14 days | Limited features, persistent warning |
| **Disabled** | Expired 14+ days / Revoked | Extension disabled, "Renew" prompt only |

**Limited Features (Grace Period):**

- Read operations only (read_file, find_in_file, get_file_metadata)
- No write operations (quick_edit, batch_quick_edit, save_changes)
- Notepad read-only

---

## III. Website Structure

### Page Architecture

```
hic-ai.com/
├── / (Landing Page)
│   ├── Hero: "Mouse: The First Proven Treatment for Execution Slop"
│   ├── Problem/Solution
│   ├── Evidence summary (stats with p-values)
│   ├── Social proof / testimonials
│   ├── CTA: "Start Free Trial" or "View Pricing"
│   └── Footer
│
├── /pricing
│   ├── Tier comparison table
│   ├── Domain-based pricing explanation
│   ├── FAQ
│   └── CTA: "Get Started"
│
├── /checkout
│   ├── Seat selector
│   ├── Billing frequency toggle
│   ├── Price calculator
│   └── Stripe Checkout redirect
│
├── /dashboard (authenticated)
│   ├── /dashboard/overview
│   │   ├── License key display
│   │   ├── Quick install instructions
│   │   └── Usage summary
│   │
│   ├── /dashboard/team (org accounts)
│   │   ├── Member list
│   │   ├── Invite flow
│   │   ├── Role management
│   │   └── Seat utilization
│   │
│   ├── /dashboard/billing
│   │   ├── Current plan
│   │   ├── Stripe Customer Portal link
│   │   └── Invoice history
│   │
│   └── /dashboard/devices
│       ├── Active devices list
│       └── Deactivate device
│
├── /docs
│   ├── Getting Started
│   ├── Installation
│   ├── Tool Reference
│   └── FAQ
│
└── /blog
    └── (SEO content, technical articles)
```

### Enterprise Self-Service Flow

**Goal:** A procurement officer can purchase 500 seats without human interaction.

```
Step 1: Visit /pricing
        └── See enterprise tier ($50/seat)

Step 2: Click "Get Started" → /checkout
        └── Enter seat count: 500
        └── Select: Annual billing
        └── See total: $255,000/year ($510 × 500)
        └── Click "Continue to Payment"

Step 3: Stripe Checkout
        └── Enter company payment details
        └── Process payment
        └── Receive confirmation email

Step 4: Redirect to /dashboard
        └── Organization automatically created
        └── License key generated (500 seats)
        └── Invite link ready to distribute to team

Step 5: Team Onboarding
        └── Admin shares invite link
        └── Team members create accounts (Auth0)
        └── Auto-joined to organization
        └── Each member gets license access
```

**Volume Purchase UX:**

- Real-time price calculator as seat count changes
- No artificial friction for large purchases
- Automatic invoice generation for accounting
- PO/invoice payment option for 100+ seats (net-30)

---

## IV. PLG + Enterprise Pilot Integration

### The Hybrid Funnel

```
                    ┌─────────────────────────────────────────┐
                    │          AWARENESS                       │
                    │  (Content, SEO, Social, Word-of-mouth)   │
                    └─────────────────┬───────────────────────┘
                                      │
                    ┌─────────────────▼───────────────────────┐
                    │          SELF-SERVICE                    │
                    │     (Website → Checkout → Use)           │
                    └─────────────────┬───────────────────────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              │                       │                       │
              ▼                       ▼                       ▼
     ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
     │   Individual    │   │   Small Team    │   │   Enterprise    │
     │    (1 seat)     │   │   (2-20 seats)  │   │   (20+ seats)   │
     └────────┬────────┘   └────────┬────────┘   └────────┬────────┘
              │                     │                     │
              │                     │                     │
              ▼                     ▼                     ▼
     ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
     │  Self-serve     │   │  Self-serve +   │   │  Self-serve OR  │
     │  (automated)    │   │  Success email  │   │  Pilot program  │
     └─────────────────┘   └─────────────────┘   └─────────────────┘
                                                          │
                                                          ▼
                                                 ┌─────────────────┐
                                                 │  Enterprise     │
                                                 │  Pilot Program  │
                                                 │                 │
                                                 │  - 30-day eval  │
                                                 │  - Success call │
                                                 │  - Custom SOW   │
                                                 │  - Negotiated   │
                                                 │    pricing      │
                                                 └─────────────────┘
```

### Product-Qualified Leads (PQLs)

**Trigger-based outreach for high-value prospects:**

| Signal                            | Action                          |
| --------------------------------- | ------------------------------- |
| 5+ users from same company domain | Send "Team plan" email          |
| 20+ seats purchased               | Assign customer success manager |
| Fortune 500 domain signup         | High-touch onboarding email     |
| Enterprise signup with 100+ seats | Personal founder email (Simon)  |
| Usage spike (device activations)  | "Need more seats?" email        |

### Enterprise Pilot Program

For prospects who need evaluation before large commitment:

**Pilot Terms:**

- Duration: 30 days
- Seats: Up to 50 (negotiable)
- Cost: Free or nominal fee ($500)
- Success criteria: Defined upfront
- Conversion: Full contract at standard enterprise pricing

**Pilot Process:**

1. Request via website form or inbound email
2. Qualification call (15 min)
3. SOW with success criteria
4. Pilot license provisioned (Keygen.sh)
5. Mid-pilot check-in (Day 15)
6. End-of-pilot review (Day 30)
7. Conversion to paid or debrief

---

## V. SEO & Content Strategy

### Target Keywords

**Primary (own the term):**

- "execution slop"
- "AI execution slop"
- "AI coding assistant errors"

**Secondary (long-tail):**

- "GitHub Copilot file editing errors"
- "AI code assistant reliability"
- "fix AI coding mistakes"
- "Cursor file corruption"
- "VS Code AI assistant problems"

### Content Calendar (First 90 Days)

| Week | Content                                              | Target Keyword                |
| ---- | ---------------------------------------------------- | ----------------------------- |
| 1    | "What is Execution Slop?" (definitional)             | execution slop                |
| 2    | "Why AI Coding Assistants Fail at File Editing"      | AI code assistant reliability |
| 4    | "Mouse vs. Find-Replace: A Technical Deep Dive"      | AI file editing               |
| 6    | "Benchmarking AI Code Editors: The Results"          | AI coding benchmarks          |
| 8    | Case study: "How [Company] Reduced AI Errors by 56%" | AI coding assistant errors    |
| 10   | "The Hidden Cost of AI Code Corruption"              | Copilot file corruption       |
| 12   | Technical paper: Full methodology release            | execution slop research       |

### Distribution Channels

- **Hacker News:** Launch post, technical deep-dives
- **Twitter/X:** Daily insights, engage with AI/dev-tools community
- **Reddit:** r/programming, r/vscode, r/artificial
- **Dev.to / Hashnode:** Mirror blog content
- **YouTube:** Demo videos, technical walkthroughs
- **LinkedIn:** Enterprise-focused content

---

## VI. Implementation Roadmap

### Phase 1: Foundation (Weeks 1-4)

| Week | Tasks                                                             |
| ---- | ----------------------------------------------------------------- |
| 1    | Set up Auth0 (startup program application, tenant config)         |
| 1    | Set up Stripe (products, prices, webhook endpoints)               |
| 1    | Set up Keygen.sh (policies, webhook endpoints)                    |
| 2    | Build basic Next.js site structure (Vercel deployment)            |
| 2    | Implement Auth0 integration (login, signup, orgs)                 |
| 3    | Implement Stripe Checkout flow                                    |
| 3    | Implement Stripe → Keygen.sh webhook (license creation)           |
| 4    | Build basic dashboard (license key display, install instructions) |

**Deliverable:** User can sign up, pay, and receive a license key.

### Phase 2: Extension Integration (Weeks 5-6)

| Week | Tasks                                             |
| ---- | ------------------------------------------------- |
| 5    | Add license validation to Mouse extension         |
| 5    | Implement device fingerprinting and registration  |
| 6    | Implement phone-home and graceful degradation     |
| 6    | Test full flow: signup → pay → install → validate |

**Deliverable:** Extension validates license and degrades appropriately.

### Phase 3: Team & Org Features (Weeks 7-8)

| Week | Tasks                                             |
| ---- | ------------------------------------------------- |
| 7    | Implement org creation flow                       |
| 7    | Implement team invite flow                        |
| 8    | Build org admin dashboard (members, roles, seats) |
| 8    | Implement domain-based pricing detection          |

**Deliverable:** Teams can self-serve at any scale.

### Phase 4: Polish & Launch (Weeks 9-10)

| Week | Tasks                               |
| ---- | ----------------------------------- |
| 9    | Landing page copywriting and design |
| 9    | Documentation site                  |
| 10   | End-to-end testing                  |
| 10   | Launch!                             |

**Deliverable:** Production-ready PLG system.

---

## VII. Cost Summary

### Monthly Operating Costs (Post-Launch)

| Service         | Cost             | Notes                              |
| --------------- | ---------------- | ---------------------------------- |
| Auth0           | $0               | Startup program (1 year free)      |
| Stripe          | 2.9% + $0.30/txn | Variable with revenue              |
| Keygen.sh       | $99/mo           | Starter plan (up to 500 licensees) |
| Vercel          | $20/mo           | Pro plan                           |
| Domain + Email  | $15/mo           | Google Workspace                   |
| **Total Fixed** | **~$135/mo**     |                                    |

### Break-Even Analysis

At $135/mo fixed cost:

- **Individual tier ($40):** 4 customers to break even
- **Enterprise tier ($50):** 3 customers to break even

---

## VIII. Risk Mitigation

| Risk                       | Mitigation                                                        |
| -------------------------- | ----------------------------------------------------------------- |
| Code piracy                | Obfuscation + license validation; focus on speed/brand/enterprise |
| Stripe fraud               | Enable Radar, require card verification for large purchases       |
| License key sharing        | Device limits (2), machine fingerprinting, floating license model |
| Auth0 startup program ends | Budget for $23/mo Essential tier after Year 1                     |
| Keygen.sh outage           | Cache last validation, 14-day offline grace period                |

---

## IX. Success Metrics

### PLG Health Indicators

| Metric             | Target (90 days)    |
| ------------------ | ------------------- |
| Website visitors   | 10,000              |
| Signups            | 500                 |
| Paid conversions   | 50 (10% conversion) |
| MRR                | $2,000+             |
| Team accounts      | 5                   |
| Avg seats per team | 5                   |

### Leading Indicators

- Time from signup to first activation
- Device activation rate (license issued → device registered)
- Weekly active licenses
- Expansion rate (seat additions per account)
- Churn rate (cancellations / total subscriptions)

---

## X. Conclusion

This PLG architecture enables HIC AI to:

1. **Monetize from Day 1** — No free tier; every user pays
2. **Scale without humans** — Self-service up to any seat count
3. **Capture enterprise** — Same flow works for 1 seat or 1,000
4. **Protect revenue** — License validation with graceful degradation
5. **Complement pilots** — Enterprise pilot program for strategic accounts

The total build time is approximately 10 weeks for a solo developer, with monthly operating costs under $150. This positions HIC AI to demonstrate revenue traction to investors while building the infrastructure for scale.

---

**Attachments:**

- None

**Distribution:**

- Simon Reiff, President & Technical Founder
- Corporate Records

---

_This memorandum is for internal planning purposes and does not constitute legal advice._
