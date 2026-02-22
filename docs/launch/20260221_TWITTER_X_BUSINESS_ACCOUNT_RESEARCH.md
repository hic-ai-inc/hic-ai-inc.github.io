# Twitter/X Business Account Research — AP 0 Item 0.3

**Date:** February 21, 2026
**Author:** Kiro
**Status:** COMPLETE
**Feeds:** D-5 (OD #16), AP12-H (OD #17), AP 12 Phase 2

---

## Findings

### 1. Can a business account be created without a personal account?

**Yes, with a nuance.** X does not have a separate "business account" type. Every account uses the same signup flow, which requires three fields:

1. **Name** — This is the display name, not a verified legal identity. You can enter "HIC AI" or "HIC AI, Inc." Brands routinely use company names here. It is not validated against any ID and can be changed later.
2. **Email or phone number** — Use a company email (e.g., `support@hic-ai.com`). Used for verification.
3. **Date of birth** — Required for age verification and content filtering. Not publicly displayed. Standard practice for company accounts is to use the founder's DOB. This is the one field that technically ties to an individual, but it's invisible to other users and not used for identity verification.

After signup, you choose a handle (`@hic_ai` if available), then customize the profile (logo, bio, website link).

No separate personal account is required. The account is not linked to any individual's personal profile. Once created, it can optionally be switched to a "Professional account" (free) to access business analytics and promotional features.

**Source:** [Indeed — How to Get Started With an X Business Account](https://www.indeed.com/hire/c/info/create-twitter-account); [UMA Technology — How to Set Up a New X Account](https://umatechnology.org/how-to-set-up-a-new-x-account/). Content was rephrased for compliance with licensing restrictions.

### 2. What's publicly visible?

A newly created account with zero followers, zero posts, and no engagement is effectively invisible. It will not appear in anyone's feed or recommendations. The only way someone discovers it is by:
- Searching the exact handle (`@hic_ai`)
- Navigating directly to `x.com/hic_ai`

**AP 13 impact: None.** Creating the account does not constitute a public disclosure. It can be created now and populated with content at the appropriate time per AP 12 Phase 2/3 sequencing.

### 3. Account tiers and pricing

| Tier | Badge | Cost | Relevant Features |
|------|-------|------|-------------------|
| Free (Basic) | None | $0 | Post, reply, DM, basic analytics |
| X Premium | Blue ✓ | $8/mo (web) or $11/mo (iOS) | Edit posts, longer posts, reduced ads, creator tools |
| Verified Organizations | Gold ✓ | ~$200/mo (reduced from original $1,000/mo launch price; pricing has fluctuated) | Gold badge, affiliate management, priority support, enhanced analytics |

**Note:** Verified Organizations pricing has changed multiple times since its 2023 launch. The current rate should be confirmed at time of purchase. Regardless, it is a significant recurring cost for a pre-revenue startup.

### 4. Handle `@hic_ai` availability

**Cannot be verified programmatically.** Simon will need to check during account creation by:
- Attempting to register the handle at signup, or
- Searching `x.com/hic_ai` to see if the profile exists

If `@hic_ai` is taken, alternatives to consider: `@hicai`, `@hic_ai_inc`, `@getmouse_ai`, `@mousebyhic`. If the handle needs to change, update references in `constants.js`, `about/page.js`, and `layout.js` per AP12-H.

---

## Recommendation

1. **Create a free X account now** using company email and `@hic_ai` handle (or best available alternative). Cost: $0. Risk: none. AP 13 safe.
2. **Defer X Premium and Verified Organizations** until post-launch when revenue justifies the spend. A blue or gold checkmark adds credibility but is not launch-blocking.
3. **Populate with initial content** per AP 12 Phase 2 timeline — bio, website link, logo, 2-3 pinned posts about Mouse before public launch.
4. **Note for AP 12 planning:** Brand engagement on X reportedly fell ~48% YoY in 2025. X remains relevant for developer audiences but should not be the primary content distribution channel. LinkedIn and Hacker News are likely higher-ROI for Mouse's target audience.

---

## Decision Inputs

- **D-5 (OD #16):** Answered. Business account can be created independently. No personal account required. SWR can create at any time without AP 13 disclosure risk.
- **AP12-H (OD #17):** Partially answered. Handle availability requires manual check by SWR during signup. If `@hic_ai` is unavailable, code references need updating.

---

## Document History

| Date | Author | Changes |
|------|--------|---------|
| 2026-02-21 | Kiro | Initial research memo — AP 0 item 0.3 complete |
