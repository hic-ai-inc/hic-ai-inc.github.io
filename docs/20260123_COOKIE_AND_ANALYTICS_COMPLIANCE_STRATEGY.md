# Cookie & Analytics Compliance Strategy

**Date:** January 23, 2026  
**Author:** GitHub Copilot  
**Status:** Ready for Review

---

## Executive Summary

This memo outlines a strategy for implementing website analytics while avoiding the complexity of cookie consent banners. By using **privacy-first analytics** that don't use cookies or track personal data, HIC AI can gain meaningful insights into website traffic without triggering GDPR, CCPA, or ePrivacy Directive consent requirements.

**Recommendation:** Use **Plausible Analytics** or **Fathom Analytics** instead of Google Analytics. These services are designed to be GDPR-compliant by default and don't require cookie consent banners.

---

## Table of Contents

1. [The Cookie Consent Problem](#1-the-cookie-consent-problem)
2. [Privacy-First Analytics Solutions](#2-privacy-first-analytics-solutions)
3. [Recommended Solution: Plausible Analytics](#3-recommended-solution-plausible-analytics)
4. [Alternative: Fathom Analytics](#4-alternative-fathom-analytics)
5. [What You Can Still Track](#5-what-you-can-still-track)
6. [What You Cannot Track](#6-what-you-cannot-track)
7. [Implementation Steps](#7-implementation-steps)
8. [Legal Considerations](#8-legal-considerations)
9. [Cost Comparison](#9-cost-comparison)
10. [Recommendation](#10-recommendation)

---

## 1. The Cookie Consent Problem

### Why Cookie Banners Exist

Under GDPR (EU), ePrivacy Directive, and similar regulations (CCPA in California, LGPD in Brazil, etc.), websites must obtain **explicit consent** before placing non-essential cookies on a user's device.

**Non-essential cookies include:**

- Analytics cookies (Google Analytics `_ga`, `_gid`, etc.)
- Advertising/tracking cookies
- Social media cookies
- Personalization cookies

**Essential cookies (no consent required):**

- Session cookies for authentication
- Shopping cart cookies
- Security cookies (CSRF tokens)
- Load balancing cookies
- Cookie consent preference cookies (ironic, but true)

### The Problem with Cookie Banners

1. **User Experience Friction** - Banners are annoying and interrupt the user journey
2. **Consent Rates** - 30-50% of users decline tracking, meaning incomplete data
3. **Legal Complexity** - Must implement proper consent management (CMP)
4. **Ongoing Compliance** - Must honor preferences, provide withdrawal mechanism
5. **Implementation Cost** - Cookie consent platforms cost $10-100+/month
6. **Dark Pattern Risks** - Regulators scrutinize "accept all" vs "reject all" UI parity

### Google Analytics is the Problem

Google Analytics 4 (GA4) uses cookies and collects personal data (IP addresses, device fingerprints). This **always** requires consent under GDPR, regardless of IP anonymization settings.

The Austrian, French, and Italian data protection authorities have all ruled that Google Analytics violates GDPR due to data transfers to the US.

---

## 2. Privacy-First Analytics Solutions

A new category of analytics tools has emerged that are designed to be privacy-compliant by default:

| Service              | Cookies | Personal Data | GDPR Compliant     | Pricing             |
| -------------------- | ------- | ------------- | ------------------ | ------------------- |
| **Plausible**        | None    | None          | Yes, EU-hosted     | $9/mo (10K views)   |
| **Fathom**           | None    | None          | Yes, EU isolation  | $14/mo (100K views) |
| **Simple Analytics** | None    | None          | Yes, EU-hosted     | $9/mo (100K views)  |
| **Umami**            | None    | None          | Yes (self-hosted)  | Free (self-hosted)  |
| **Pirsch**           | None    | None          | Yes, German-hosted | €5/mo (10K views)   |
| Google Analytics     | Yes     | Yes           | Requires consent   | Free                |

### How Privacy-First Analytics Work

Instead of cookies, these services use:

1. **Page URL** - What page was visited
2. **Referrer** - Where the visitor came from
3. **User Agent** - Browser and OS (not fingerprinted)
4. **Country** - Derived from IP, then IP discarded
5. **Screen Size** - Viewport dimensions (aggregated)

They create a **daily hash** of: `IP + User Agent + Website Domain + Daily Salt`

This hash:

- Cannot be reversed to identify individuals
- Cannot track users across sites
- Resets every 24 hours (no long-term tracking)
- Is never stored (only the aggregate count)

---

## 3. Recommended Solution: Plausible Analytics

### Why Plausible

1. **EU-Owned and Hosted** - Company in Estonia, servers in Germany
2. **Open Source** - Code is auditable (AGPL license)
3. **Lightweight** - <1KB script vs ~45KB for GA4
4. **Simple Dashboard** - No training needed
5. **Public Dashboard Option** - Can share stats publicly for transparency
6. **Goal/Event Tracking** - Track button clicks, form submissions
7. **UTM Support** - Full campaign tracking
8. **API Access** - Export data programmatically

### Plausible Pricing

| Plan     | Monthly Pageviews | Price   |
| -------- | ----------------- | ------- |
| Growth   | 10K               | $9/mo   |
| Growth   | 100K              | $19/mo  |
| Growth   | 200K              | $29/mo  |
| Growth   | 500K              | $49/mo  |
| Growth   | 1M                | $69/mo  |
| Business | Custom            | Contact |

For a startup website, the $9/mo plan (10K pageviews) is likely sufficient initially.

### What Plausible Tracks

- **Unique Visitors** (daily, not cross-session)
- **Total Pageviews**
- **Bounce Rate**
- **Visit Duration**
- **Pages** (most popular)
- **Entry Pages**
- **Exit Pages**
- **Referral Sources** (Google, Twitter, etc.)
- **UTM Campaigns** (utm_source, utm_medium, utm_campaign)
- **Countries** (no city-level)
- **Devices** (Desktop, Mobile, Tablet)
- **Browsers** (Chrome, Firefox, Safari)
- **Operating Systems** (Windows, macOS, iOS, Android)
- **Custom Events** (button clicks, form submissions)
- **Goals** (conversion tracking)

### What Plausible Does NOT Track

- Individual user behavior over time
- Cross-site tracking
- Demographic data (age, gender)
- Interests/affinity categories
- User IDs or persistent identifiers
- Heatmaps or session recordings
- A/B test user assignment (need separate tool)

---

## 4. Alternative: Fathom Analytics

### Why Consider Fathom

1. **Canadian Company** - Strong privacy laws
2. **EU Data Isolation** - EU visitor data stays in EU
3. **Slightly More Features** - Built-in uptime monitoring
4. **Generous Free Tier** - 100K pageviews at $14/mo

### Fathom Pricing

| Plan     | Monthly Pageviews | Price  |
| -------- | ----------------- | ------ |
| Starter  | 100K              | $14/mo |
| Business | 200K              | $24/mo |
| Business | 500K              | $44/mo |
| Business | 1M                | $74/mo |

### Fathom vs Plausible

| Feature              | Plausible     | Fathom             |
| -------------------- | ------------- | ------------------ |
| Open Source          | Yes (AGPL)    | No                 |
| EU Hosting           | Yes (Germany) | EU Isolation       |
| Pricing (10K views)  | $9/mo         | N/A ($14 for 100K) |
| Pricing (100K views) | $19/mo        | $14/mo             |
| Script Size          | <1KB          | ~2KB               |
| Public Dashboard     | Yes           | Yes                |
| API                  | Yes           | Yes                |
| Email Reports        | Yes           | Yes                |
| Uptime Monitoring    | No            | Yes                |

**Verdict:** Plausible is cheaper for low traffic, more transparent (open source), and EU-native. Fathom is better value at higher traffic volumes.

---

## 5. What You Can Still Track

Even without cookies, you get meaningful analytics:

### Traffic Overview

- How many people visit your site (daily uniques)
- Which pages are most popular
- Bounce rate (single-page visits)
- Average time on page

### Acquisition

- Where visitors come from (Google, Twitter, LinkedIn, direct)
- Which marketing campaigns drive traffic (UTM parameters)
- Which referring sites send traffic

### Technology

- Device type breakdown (mobile vs desktop)
- Browser popularity
- Operating system distribution
- Country-level geography

### Conversions

- Custom event tracking (button clicks, form submissions)
- Goal completion rates
- Funnel analysis (with custom events)

### Example: Tracking PLG Funnel

```javascript
// Track CTA clicks
document.querySelector(".cta-install").addEventListener("click", () => {
  plausible("CTA Click", { props: { location: "hero" } });
});

// Track pricing page views
// (automatic via page tracking)

// Track "Start Trial" clicks
document.querySelector(".start-trial").addEventListener("click", () => {
  plausible("Start Trial Click");
});
```

This gives you:

- Visitors → Pricing Page views → Trial clicks
- Conversion rate at each step
- Which CTAs perform best

---

## 6. What You Cannot Track

### Without Cookies, You Lose:

1. **Cross-Session Identity**
   - Cannot know if the same person visits Monday and Friday
   - Cannot calculate true "returning visitor" rate

2. **Long-Term Cohort Analysis**
   - Cannot track "users acquired in January" over months
   - Cannot calculate customer lifetime journey

3. **Individual User Paths**
   - Cannot see "User A visited Home → Pricing → Docs → Trial"
   - Only aggregate page popularity

4. **A/B Test Assignment**
   - Need separate tool (Optimizely, VWO, or roll your own)
   - Or use server-side assignment with user accounts

5. **Personalization**
   - Cannot remember preferences without login
   - Cannot show "Welcome back" messages

6. **Remarketing**
   - Cannot create audiences for ad retargeting
   - Cannot use Google/Facebook pixels

### Mitigations

For the PLG funnel specifically:

| Need                    | Without Cookies          | With User Accounts                     |
| ----------------------- | ------------------------ | -------------------------------------- |
| Trial → Paid conversion | Track via license server | Full funnel visibility                 |
| Feature adoption        | Cannot track             | Track via extension telemetry (opt-in) |
| Churn prediction        | Cannot track             | Track via license renewals             |
| User journey            | Aggregate only           | Full journey with consent              |

**Key Insight:** Once users create an account (trial/paid), you CAN track them with consent because they've established a relationship. The website analytics limitation is for anonymous visitors only.

---

## 7. Implementation Steps

### Step 1: Create Plausible Account

1. Go to https://plausible.io
2. Click "Start free trial" (30-day trial, no credit card)
3. Enter email and create password
4. Add your site: `hic-ai.com`
5. Add any subdomains: `www.hic-ai.com`, `docs.hic-ai.com`

### Step 2: Add Tracking Script

Add to your site's `<head>`:

```html
<script
  defer
  data-domain="hic-ai.com"
  src="https://plausible.io/js/script.js"
></script>
```

For Next.js (PLG website), add to `src/app/layout.js`:

```javascript
import Script from "next/script";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <Script
          defer
          data-domain="hic-ai.com"
          src="https://plausible.io/js/script.js"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

### Step 3: Set Up Custom Events

For tracking button clicks and conversions:

```javascript
// src/lib/analytics.js
export function trackEvent(eventName, props = {}) {
  if (typeof window !== "undefined" && window.plausible) {
    window.plausible(eventName, { props });
  }
}

// Usage in components
import { trackEvent } from "@/lib/analytics";

function CTAButton() {
  return (
    <button onClick={() => trackEvent("CTA Click", { location: "hero" })}>
      Install Mouse
    </button>
  );
}
```

### Step 4: Configure Goals in Plausible Dashboard

1. Log into Plausible
2. Go to Site Settings → Goals
3. Add goals:
   - `CTA Click` (custom event)
   - `Start Trial Click` (custom event)
   - `Pageview: /pricing` (pageview goal)
   - `Pageview: /docs` (pageview goal)

### Step 5: Set Up Email Reports (Optional)

1. Site Settings → Email Reports
2. Enable weekly or monthly reports
3. Add recipient emails

### Step 6: Make Dashboard Public (Optional)

For transparency, you can make your analytics public:

1. Site Settings → Visibility
2. Set to "Public"
3. Share link: `https://plausible.io/hic-ai.com`

---

## 8. Legal Considerations

### Do You Need a Cookie Banner?

**No**, if you ONLY use privacy-first analytics (Plausible/Fathom) and:

- No Google Analytics
- No Facebook Pixel
- No advertising cookies
- No third-party tracking scripts
- No session replay tools (FullStory, Hotjar)

### Do You Need a Privacy Policy?

**Yes**, always. But it can be simple:

```markdown
## Analytics

We use Plausible Analytics to understand how visitors use our website.
Plausible does not use cookies and does not collect personal data.
All data is aggregated and cannot be used to identify individual visitors.

Learn more: https://plausible.io/data-policy
```

### Do You Need Cookie Consent for Essential Cookies?

**No**. If you later add:

- Authentication (session cookies)
- CSRF protection
- Load balancing

These are "strictly necessary" and don't require consent.

### What If You Add Stripe/Paddle Later?

Payment processors may set their own cookies on checkout pages. This is generally covered under "contract performance" (necessary to process payment), but review their specific policies:

- **Stripe:** Sets minimal functional cookies, generally no consent needed
- **Paddle/Lemon Squeezy:** As MoR, they handle compliance on their checkout

### CCPA Considerations (California)

CCPA requires "Do Not Sell My Personal Information" link IF you sell personal data.

With Plausible/Fathom:

- No personal data is collected
- No data is sold
- No CCPA notice required

### International Visitors

Privacy-first analytics are compliant with:

- GDPR (EU)
- ePrivacy Directive (EU)
- CCPA (California)
- LGPD (Brazil)
- POPIA (South Africa)
- PDPA (Singapore, Thailand)
- Privacy Act (Australia)

---

## 9. Cost Comparison

### Option A: Google Analytics + Cookie Consent

| Item                                          | Monthly Cost             |
| --------------------------------------------- | ------------------------ |
| Google Analytics                              | Free                     |
| Cookie Consent Platform (Cookiebot, OneTrust) | $10-50/mo                |
| Legal review of consent implementation        | $500-2000 (one-time)     |
| Ongoing compliance monitoring                 | Time/effort              |
| **Effective Data**                            | 50-70% (due to opt-outs) |

**Total: $10-50/mo + compliance overhead + incomplete data**

### Option B: Plausible Analytics (No Consent Needed)

| Item                                | Monthly Cost     |
| ----------------------------------- | ---------------- |
| Plausible Analytics (10K pageviews) | $9/mo            |
| Cookie Consent Platform             | $0               |
| Legal review                        | Minimal          |
| **Effective Data**                  | 100% of visitors |

**Total: $9/mo + complete data + no consent friction**

### Verdict

Plausible is **cheaper**, **simpler**, and provides **complete data** because there's no opt-out friction.

---

## 10. Recommendation

### Immediate Action

1. **Sign up for Plausible Analytics** - https://plausible.io ($9/mo after 30-day trial)
2. **Add tracking script** to PLG website
3. **Set up custom events** for CTA clicks and conversions
4. **Update Privacy Policy** with simple analytics disclosure
5. **Do NOT add a cookie banner** (not needed)

### Accounts to Create

| Account             | Purpose           | Cost  |
| ------------------- | ----------------- | ----- |
| Plausible Analytics | Website analytics | $9/mo |

That's it. No cookie consent platform, no additional legal tools.

### What NOT to Add

Avoid these if you want to stay cookie-banner-free:

- ❌ Google Analytics
- ❌ Google Tag Manager (often used for tracking)
- ❌ Facebook Pixel
- ❌ LinkedIn Insight Tag
- ❌ Hotjar / FullStory / LogRocket (session replay)
- ❌ Intercom / Drift (chat widgets often set cookies)
- ❌ HubSpot tracking (marketing automation)

### Future Consideration

If you later need more advanced analytics (cohorts, user journeys, A/B testing), consider:

1. **PostHog** - Open source product analytics, can self-host
2. **Mixpanel** - User-level analytics with consent
3. **Amplitude** - Product analytics with consent

These require cookie consent but may be worth it as you scale. Implement ONLY with proper consent management.

---

## Appendix A: Sample Privacy Policy Section

```markdown
## How We Use Your Information

### Website Analytics

We use Plausible Analytics, a privacy-focused analytics service, to understand
how visitors interact with our website. Plausible:

- Does not use cookies
- Does not collect personal data
- Does not track you across websites
- Is hosted in the EU (Germany)

All analytics data is aggregated and cannot identify individual visitors.
You can view our public analytics dashboard at: [link if enabled]

Learn more about Plausible's privacy practices: https://plausible.io/data-policy

### Cookies We Use

We only use strictly necessary cookies:

| Cookie           | Purpose | Duration |
| ---------------- | ------- | -------- |
| (none currently) | —       | —        |

We do not use advertising cookies, tracking cookies, or analytics cookies.
```

---

## Appendix B: Implementation Checklist

### Pre-Launch

- [ ] Create Plausible account
- [ ] Verify domain ownership
- [ ] Add tracking script to website

### Launch

- [ ] Verify data is flowing in Plausible dashboard
- [ ] Set up custom event tracking for CTAs
- [ ] Configure goals in Plausible

### Post-Launch

- [ ] Update Privacy Policy
- [ ] Set up weekly email reports
- [ ] Review analytics after 1 week to ensure accuracy

### Ongoing

- [ ] Monitor traffic trends
- [ ] Track conversion goals
- [ ] Consider public dashboard for transparency

---

## Document History

| Date       | Author         | Changes          |
| ---------- | -------------- | ---------------- |
| 2026-01-23 | GitHub Copilot | Initial document |

---

_This document provides guidance on cookie compliance and analytics implementation. For specific legal advice regarding your jurisdiction and business model, consult with a qualified attorney._
