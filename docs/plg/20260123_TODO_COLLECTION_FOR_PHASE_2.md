# MEMORANDUM

**TO:** Simon Reiff, President & Technical Founder  
**FROM:** GC  
**DATE:** January 23, 2026  
**RE:** TODO Collection for Phase 2 — Implementation Gaps Before Testing

---

## Executive Summary

This document collects all outstanding TODOs from the PLG codebase, organized by priority and category. These items should be addressed before proceeding with comprehensive automated and integration testing.

**Summary:**

| Category                    | Count  | Priority    | Est. Hours |
| --------------------------- | ------ | ----------- | ---------- |
| Security                    | 1      | 🔴 Critical | 1h         |
| Code Cleanup                | 2      | 🟡 High     | 2h         |
| Missing Functions           | 5      | 🟡 High     | 6h         |
| Missing Email Templates     | 2      | 🟢 Medium   | 2h         |
| Infrastructure (Addendum A) | 8      | 🔴 Critical | 22h        |
| **Total**                   | **18** | —           | **~33h**   |

---

## 1. Security TODOs (Critical)

### 1.1 License Ownership Verification

**File:** [plg-website/src/app/api/license/deactivate/route.js](../../plg-website/src/app/api/license/deactivate/route.js#L41)

```javascript
// TODO: SECURITY — Implement license ownership verification
// This is critical to prevent users from deactivating others' devices.
// Uncomment and test:
// const userLicenses = await getCustomerLicenses(session.user.sub);
// if (!userLicenses.find(l => l.keygenLicenseId === licenseId)) {
//   return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
// }
```

**Action Required:**

1. Uncomment the ownership verification code
2. Test with valid and invalid license ownership scenarios
3. Ensure proper error messages are returned

**Priority:** 🔴 Critical (security vulnerability)  
**Estimate:** 1 hour

---

## 2. Code Cleanup TODOs (High)

### 2.1 Remove OSS Tier

**File:** [plg-website/src/lib/constants.js](../../plg-website/src/lib/constants.js#L14)

```javascript
// TODO: Remove OSS tier per Addendum A.1 — focus on Individual ($10) and Enterprise ($25) only
```

**Action Required:**

1. Remove `oss` tier from `PRICING` object
2. Update all references to OSS tier throughout codebase
3. Update pricing page UI
4. Remove `/checkout/oss` route

**Files Affected:**

- `plg-website/src/lib/constants.js`
- `plg-website/src/app/pricing/page.js`
- `plg-website/src/app/checkout/oss/page.js`

**Priority:** 🟡 High  
**Estimate:** 1 hour

---

### 2.2 Remove OSS Application Endpoint

**File:** [plg-website/src/app/api/oss-application/route.js](../../plg-website/src/app/api/oss-application/route.js#L11)

```javascript
// TODO: REMOVE THIS ENDPOINT — OSS tier deferred per Addendum A.1
// Focus on Individual ($10) and Enterprise ($25) tiers for MVP.
// Keep code archived in case we add OSS tier post-launch.
```

**Action Required:**

1. Delete or comment out the entire endpoint
2. Optionally move to `_archived/` folder for future reference
3. Remove any UI links to OSS application

**Priority:** 🟡 High  
**Estimate:** 0.5 hours

---

## 3. Missing Functions TODOs (High)

### 3.1 Stripe Helper Functions

**File:** [plg-website/src/lib/stripe.js](../../plg-website/src/lib/stripe.js#L73)

```javascript
// TODO: Add helper functions for common Stripe operations:
//   - createCheckoutSession({ priceId, customerId, successUrl, cancelUrl })
//   - createPortalSession(customerId, returnUrl)
//   - updateSubscriptionQuantity(subscriptionId, quantity) — for Enterprise seat changes per Addendum A.5.4
```

**Action Required:**

1. Implement `createCheckoutSession()` — reusable checkout creation
2. Implement `createPortalSession()` — customer portal access
3. Implement `updateSubscriptionQuantity()` — Enterprise seat management

**Priority:** 🟡 High  
**Estimate:** 2 hours

---

### 3.2 DynamoDB License Key Lookup

**File:** [plg-website/src/lib/dynamodb.js](../../plg-website/src/lib/dynamodb.js#L176)

```javascript
// TODO: Add getLicenseByKey(licenseKey) for activation endpoint — query GSI2 by LICENSE_KEY#<key>
```

**Action Required:**

1. Implement `getLicenseByKey(licenseKey)` function
2. Query GSI2 with `GSI2PK = LICENSE_KEY#<key>`
3. Used by `/api/license/activate` and `/api/license/validate`

**Priority:** 🟡 High  
**Estimate:** 1 hour

---

### 3.3 DynamoDB Enterprise Admin Functions

**File:** [plg-website/src/lib/dynamodb.js](../../plg-website/src/lib/dynamodb.js#L177)

```javascript
// TODO: Add enterprise admin functions per Addendum A.5/A.7:
//   - getOrgMembers(orgId)
//   - updateOrgMemberStatus(orgId, memberId, status)
//   - getOrgLicenseUsage(orgId)
```

**Action Required:**

1. Implement `getOrgMembers(orgId)` — list organization members
2. Implement `updateOrgMemberStatus()` — revoke/reinstate members
3. Implement `getOrgLicenseUsage()` — seat usage statistics

**Supports:**

- A.5 Upgrade/Downgrade Journeys (seat reduction)
- A.7 License Transfer Journey

**Priority:** 🟡 High  
**Estimate:** 2 hours

---

### 3.4 Add License Statuses

**File:** [plg-website/src/lib/constants.js](../../plg-website/src/lib/constants.js#L113)

```javascript
// TODO: Add RETIRED and DISPUTED statuses per Addendum A.5.3 and A.6.2
```

**Action Required:**

1. Add `RETIRED` status for Enterprise seat reduction
2. Add `DISPUTED` status for chargeback handling
3. Add corresponding display configurations

```javascript
export const LICENSE_STATUS = {
  // ... existing ...
  RETIRED: "RETIRED", // A.5.3 - Admin retired seat
  DISPUTED: "DISPUTED", // A.6.2 - Chargeback in progress
};

export const LICENSE_STATUS_DISPLAY = {
  // ... existing ...
  RETIRED: { label: "Retired", variant: "error" },
  DISPUTED: { label: "Disputed", variant: "warning" },
};
```

**Priority:** 🟡 High  
**Estimate:** 0.5 hours

---

### 3.5 Use PRICING Constants in Portal

**File:** [plg-website/src/app/api/portal/devices/route.js](../../plg-website/src/app/api/portal/devices/route.js#L66)

```javascript
// TODO: Use PRICING constants instead of hardcoded values
// import { PRICING } from "@/lib/constants";
// const maxDevices = PRICING[customer.accountType]?.maxDevices || 3;
```

**Action Required:**

1. Import PRICING constants
2. Replace hardcoded device limits
3. Ensure fallback for edge cases

**Priority:** 🟡 High  
**Estimate:** 0.5 hours

---

## 4. Missing Email Templates (Medium)

### 4.1 Win-Back and Enterprise Invite Emails

**File:** [plg-website/src/lib/ses.js](../../plg-website/src/lib/ses.js#L28)

```javascript
// TODO: Add missing email templates per Addendum A:
//   - winBack30 (A.9.2) — "We miss you" at 30 days
//   - winBack90 (A.9.2) — "Special offer" at 90 days
//   - enterpriseInvite (A.7) — "You've been invited to use Mouse"
```

**Note:** The following templates were already implemented:

- ✅ `reactivation` (A.2)
- ✅ `cancellation` (A.9.1)
- ✅ `licenseRevoked` (A.7)

**Action Required:**

1. Implement `winBack30` template — 30-day retention email
2. Implement `winBack90` template — 90-day retention email with discount
3. Implement `enterpriseInvite` template — Team member invitation

**Priority:** 🟢 Medium (needed for scheduled jobs)  
**Estimate:** 2 hours

---

### 4.2 Keygen Subscription Created Handler

**File:** [plg-website/src/app/api/webhooks/stripe/route.js](../../plg-website/src/app/api/webhooks/stripe/route.js#L149)

```javascript
// TODO: Update license status in Keygen if needed
```

**Action Required:**

1. Determine if Keygen license needs update on subscription creation
2. If yes, call Keygen API to sync license state
3. May be redundant with checkout flow — verify

**Priority:** 🟢 Medium  
**Estimate:** 1 hour

---

## 5. Infrastructure TODOs (Critical — Per Addendum A)

These are documented in detail in [20260123_INFRASTRUCTURE_GAP_ANALYSIS_AND_PLAN.md](./20260123_INFRASTRUCTURE_GAP_ANALYSIS_AND_PLAN.md#a8-updated-implementation-order).

| #   | Task                                       | Est. Hours | Status |
| --- | ------------------------------------------ | ---------- | ------ |
| 1   | `plg-dynamodb.yaml` (table + stream)       | 2h         | ⬜     |
| 2   | `plg-messaging.yaml` (SNS + SQS)           | 2h         | ⬜     |
| 3   | `plg-iam.yaml` (all roles)                 | 2h         | ⬜     |
| 4   | `plg-compute.yaml` (4 Lambdas)             | 3h         | ⬜     |
| 5   | `plg-ses.yaml` (email infra)               | 1h         | ⬜     |
| 6   | `plg-scheduled.yaml` (EventBridge rules)   | 1h         | ⬜     |
| 7   | `plg-monitoring.yaml` (metrics, dashboard) | 2h         | ⬜     |
| 8   | `plg-main-stack.yaml` (orchestrator)       | 1h         | ⬜     |
| 9   | `deploy.sh` with dry-run                   | 2h         | ⬜     |
| 10  | GitHub Actions workflows                   | 3h         | ⬜     |
| 11  | `amplify.yml`                              | 1h         | ⬜     |
| 12  | HTTP test files                            | 2h         | ⬜     |

**Total Infrastructure:** ~22 hours

---

## 6. Recommended Phase 2 Execution Order

### Phase 2A: Security & Cleanup (3 hours)

| Priority | Task                                  | Est. |
| -------- | ------------------------------------- | ---- |
| 1        | License ownership verification (§1.1) | 1h   |
| 2        | Remove OSS tier from constants (§2.1) | 1h   |
| 3        | Remove/archive OSS endpoint (§2.2)    | 0.5h |
| 4        | Add RETIRED/DISPUTED statuses (§3.4)  | 0.5h |

### Phase 2B: Missing Functions (4 hours)

| Priority | Task                                   | Est. |
| -------- | -------------------------------------- | ---- |
| 5        | Use PRICING constants in portal (§3.5) | 0.5h |
| 6        | getLicenseByKey function (§3.2)        | 1h   |
| 7        | Stripe helper functions (§3.1)         | 2h   |
| 8        | Keygen subscription handler (§4.2)     | 0.5h |

### Phase 2C: Enterprise Functions (2 hours)

| Priority | Task                                       | Est. |
| -------- | ------------------------------------------ | ---- |
| 9        | Enterprise admin DynamoDB functions (§3.3) | 2h   |

### Phase 2D: Remaining Email Templates (2 hours)

| Priority | Task                                 | Est. |
| -------- | ------------------------------------ | ---- |
| 10       | winBack30/winBack90 templates (§4.1) | 1.5h |
| 11       | enterpriseInvite template (§4.1)     | 0.5h |

### Phase 2E: Infrastructure (22 hours)

As detailed in Addendum A — CloudFormation templates, deploy scripts, CI/CD.

---

## 7. Dependencies for Testing Phase

Before comprehensive testing can begin, the following **must** be complete:

### Must-Have for Unit Tests:

- ✅ All lib functions implemented
- ⬜ License ownership verification (§1.1)
- ⬜ getLicenseByKey function (§3.2)
- ⬜ Add LICENSE_STATUS values (§3.4)

### Must-Have for Integration Tests:

- ⬜ Infrastructure deployed (Phase 2E)
- ⬜ HTTP test files created
- ⬜ Stripe helper functions (§3.1)
- ⬜ Enterprise admin functions (§3.3)

### Nice-to-Have (Can Test Later):

- Win-back email templates (§4.1)
- Enterprise invite template (§4.1)

---

## 8. Summary

| Phase     | Description          | Hours   | Cumulative |
| --------- | -------------------- | ------- | ---------- |
| 2A        | Security & Cleanup   | 3h      | 3h         |
| 2B        | Missing Functions    | 4h      | 7h         |
| 2C        | Enterprise Functions | 2h      | 9h         |
| 2D        | Email Templates      | 2h      | 11h        |
| 2E        | Infrastructure       | 22h     | 33h        |
| **Total** | —                    | **33h** | —          |

**Recommendation:** Complete Phases 2A-2D (~11 hours) before writing unit tests. Infrastructure (Phase 2E) can proceed in parallel with test development since it's IaC-focused.

---

**Document Version:** 1.0  
**Status:** Ready for Review
