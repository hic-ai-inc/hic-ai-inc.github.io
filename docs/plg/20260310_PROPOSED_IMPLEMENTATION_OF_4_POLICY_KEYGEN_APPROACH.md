# Proposed Implementation of 4-Policy Keygen Approach

**Date:** March 10, 2026  
**Author:** Copilot (Claude Opus 4.6)  
**Status:** PROPOSED — Awaiting SWR Review  
**Context:** Status Remediation Plan, Task 16.2 (Keygen policy durations)

---

## 1. Background

### Problem

Our current Keygen setup has 2 policies (Individual and Business), each with a ~1-month duration. This means:

- Monthly subscribers get ~30 days of license validity per renewal — correct.
- Annual subscribers _also_ get ~30 days per renewal — incorrect. They should get ~1 year.

When Stripe renews a subscription, our webhook calls `renewLicense(licenseId)`, which extends expiry by `policy.duration`. With a single-duration policy per tier, monthly and annual subscribers get the same renewal window.

### Solution

Split 2 policies into 4, with durations matching billing intervals plus grace periods:

| Policy Name        | Duration (days) | Duration (seconds) | Grace Period |
| ------------------ | --------------- | ------------------ | ------------ |
| Individual Monthly | 44              | 3,801,600          | 14 days      |
| Individual Annual  | 379             | 32,745,600         | 14 days      |
| Business Monthly   | 44              | 3,801,600          | 14 days      |
| Business Annual    | 379             | 32,745,600         | 14 days      |

### Safety Validation

Per the Keygen Licenses API documentation, the **Change Policy** endpoint (`PUT /v1/accounts/{ACCOUNT}/licenses/{id}/policy`) is purpose-built for this:

- **License keys are immutable** — the same key is preserved after a policy change.
- **Machine activations are preserved** — unlike revoke/delete, which immediately deletes machines.
- **The `transferStrategy` attribute** on the target policy controls expiry behavior:
  - `KEEP_EXPIRY` (default) — don't touch the current expiry.
  - `RESET_EXPIRY` — recalculate as `time.now + new_policy.duration`.
- **Limitations** (none apply to us): Cannot change encrypted↔unencrypted, pooled↔unpooled, to less strict fingerprint strategy, or to different cryptographic scheme.

---

## 2. Keygen Dashboard Configuration (Manual — SWR)

### 2.1 Rename Existing Policies

In the Keygen dashboard (https://app.keygen.sh), rename:

- **"Individual"** → **"Individual Monthly"**
- **"Business"** → **"Business Monthly"**

Then update their durations:

- **Individual Monthly**: `duration` = `3801600` (44 days = 30 + 14 grace)
- **Business Monthly**: `duration` = `3801600` (44 days = 30 + 14 grace)

Both policies should also have:

- `transferStrategy` = `RESET_EXPIRY` (so when a license is transferred to this policy, its expiry resets to `now + 44 days`)
- `renewalBasis` = `FROM_EXPIRY` (default — on renewal, `expiry = expiry + duration`)

### 2.2 Create New Policies

Create 2 new policies under the Mouse product:

**Individual Annual:**

- `name` = "Individual Annual"
- `duration` = `32745600` (379 days = 365 + 14 grace)
- `transferStrategy` = `RESET_EXPIRY`
- `renewalBasis` = `FROM_EXPIRY`
- All other settings: clone from Individual Monthly

**Business Annual:**

- `name` = "Business Annual"
- `duration` = `32745600` (379 days = 365 + 14 grace)
- `transferStrategy` = `RESET_EXPIRY`
- `renewalBasis` = `FROM_EXPIRY`
- All other settings: clone from Business Monthly

### 2.3 Record New Policy UUIDs

After creation, record the UUIDs for each of the 4 policies. These will be stored in SSM Parameter Store.

### 2.4 SSM Parameter Store Updates

Using `./scripts/update-amplify-env.sh`, add 4 new SSM parameters (replacing the 2 existing ones):

```
/plg/secrets/<app-id>/KEYGEN_POLICY_ID_INDIVIDUAL_MONTHLY  = <uuid>
/plg/secrets/<app-id>/KEYGEN_POLICY_ID_INDIVIDUAL_ANNUAL   = <uuid>
/plg/secrets/<app-id>/KEYGEN_POLICY_ID_BUSINESS_MONTHLY    = <uuid>
/plg/secrets/<app-id>/KEYGEN_POLICY_ID_BUSINESS_ANNUAL     = <uuid>
```

**Migration note:** Delete the 2 old SSM parameters (`KEYGEN_POLICY_ID_INDIVIDUAL`, `KEYGEN_POLICY_ID_BUSINESS`) at the same time. Since we are pre-production, there is no need to retain them as fallback aliases. A clean cutover avoids the risk of annual licenses silently falling back to monthly policy UUIDs.

### 2.5 Environment Variables (.env.local)

For local development, update `.env.local`:

```
KEYGEN_POLICY_ID_INDIVIDUAL_MONTHLY=<uuid>
KEYGEN_POLICY_ID_INDIVIDUAL_ANNUAL=<uuid>
KEYGEN_POLICY_ID_BUSINESS_MONTHLY=<uuid>
KEYGEN_POLICY_ID_BUSINESS_ANNUAL=<uuid>
```

Remove the old `KEYGEN_POLICY_ID_INDIVIDUAL` and `KEYGEN_POLICY_ID_BUSINESS` entries entirely.

---

## 3. Code Changes

### 3.1 File: `plg-website/src/lib/secrets.js`

**What changes:** Expand SSM parameter paths and `getKeygenPolicyIds()` to support 4 policies instead of 2.

**SSM_SECRET_PATHS (line ~54):**

```javascript
// BEFORE
KEYGEN_POLICY_ID_INDIVIDUAL: `/plg/secrets/${AMPLIFY_APP_ID}/KEYGEN_POLICY_ID_INDIVIDUAL`,
KEYGEN_POLICY_ID_BUSINESS: `/plg/secrets/${AMPLIFY_APP_ID}/KEYGEN_POLICY_ID_BUSINESS`,

// AFTER
KEYGEN_POLICY_ID_INDIVIDUAL_MONTHLY: `/plg/secrets/${AMPLIFY_APP_ID}/KEYGEN_POLICY_ID_INDIVIDUAL_MONTHLY`,
KEYGEN_POLICY_ID_INDIVIDUAL_ANNUAL: `/plg/secrets/${AMPLIFY_APP_ID}/KEYGEN_POLICY_ID_INDIVIDUAL_ANNUAL`,
KEYGEN_POLICY_ID_BUSINESS_MONTHLY: `/plg/secrets/${AMPLIFY_APP_ID}/KEYGEN_POLICY_ID_BUSINESS_MONTHLY`,
KEYGEN_POLICY_ID_BUSINESS_ANNUAL: `/plg/secrets/${AMPLIFY_APP_ID}/KEYGEN_POLICY_ID_BUSINESS_ANNUAL`,
```

**`getKeygenPolicyIds()` (line ~338):**

```javascript
// BEFORE: returns { individual, business }
// AFTER: returns { individualMonthly, individualAnnual, businessMonthly, businessAnnual }

// Non-production path:
return {
  individualMonthly: process.env.KEYGEN_POLICY_ID_INDIVIDUAL_MONTHLY,
  individualAnnual: process.env.KEYGEN_POLICY_ID_INDIVIDUAL_ANNUAL,
  businessMonthly: process.env.KEYGEN_POLICY_ID_BUSINESS_MONTHLY,
  businessAnnual: process.env.KEYGEN_POLICY_ID_BUSINESS_ANNUAL,
};

// Production SSM path: fetch all 4 from SSM (no fallback — fail loudly if missing)
```

**No fallback.** Since we are pre-production, there is no graduated transition. If any of the 4 policy IDs are missing, the system should fail loudly (consistent with the existing FINDING-4 pattern in `getKeygenPolicyIds()`). A silent fallback from annual → monthly would cause an annual license to get a 44-day renewal window instead of 379 days — a serious, hard-to-detect regression.

---

### 3.2 File: `plg-website/src/lib/keygen.js`

**What changes:** Update `KEYGEN_POLICIES`, `getPolicyId()`, and add new `changeLicensePolicy()` function.

#### 3.2.1 `KEYGEN_POLICIES` constant (line ~38)

```javascript
// BEFORE
export const KEYGEN_POLICIES = {
  get individual() {
    return "individual";
  },
  get business() {
    return "business";
  },
};

// AFTER
export const KEYGEN_POLICIES = {
  get individualMonthly() {
    return "individualMonthly";
  },
  get individualAnnual() {
    return "individualAnnual";
  },
  get businessMonthly() {
    return "businessMonthly";
  },
  get businessAnnual() {
    return "businessAnnual";
  },
};
// No legacy aliases. All call sites are updated in the same commit.
```

#### 3.2.2 `getPolicyId(planType)` (line ~421)

```javascript
// BEFORE: accepts "individual" | "business"
// AFTER: accepts "individualMonthly" | "individualAnnual" | "businessMonthly" | "businessAnnual"
// No legacy mapping — all callers must use 4-key names.

export async function getPolicyId(planType) {
  const policyIds = await getKeygenPolicyIds();
  const policyId = policyIds[planType];

  if (!policyId) {
    throw new Error(
      `Unknown plan type: ${planType}. Available: ${Object.keys(policyIds).join(", ")}`,
    );
  }
  return policyId;
}
```

#### 3.2.3 New function: `changeLicensePolicy(licenseId, newPolicyId)`

Add after `updateLicenseMetadata()` (around line ~300):

```javascript
/**
 * Change a license's policy (e.g., monthly → annual)
 * Preserves the license key and machine activations.
 * Expiry behavior is controlled by the target policy's transferStrategy.
 *
 * @param {string} licenseId - The Keygen license UUID
 * @param {string} newPolicyId - The target policy UUID
 * @returns {Promise<object>} The updated license object
 * @see https://keygen.sh/docs/api/licenses/#licenses-relationships-change-policy
 */
export async function changeLicensePolicy(licenseId, newPolicyId) {
  return keygenRequest(`/licenses/${licenseId}/policy`, {
    method: "PUT",
    body: JSON.stringify({
      data: {
        type: "policies",
        id: newPolicyId,
      },
    }),
  });
}
```

#### 3.2.4 New helper: `resolvePlanType(plan, billingCycle)`

Add as a convenience function:

```javascript
/**
 * Resolve a plan + billing cycle to a 4-policy plan type
 * @param {string} plan - "individual" or "business"
 * @param {string} billingCycle - "monthly" or "annual"
 * @returns {string} e.g., "individualMonthly", "businessAnnual"
 */
export function resolvePlanType(plan, billingCycle) {
  const cycle = billingCycle === "annual" ? "Annual" : "Monthly";
  const tier = plan === "business" ? "business" : "individual";
  return `${tier}${cycle}`;
}
```

---

### 3.3 File: `plg-website/src/app/api/webhooks/stripe/route.js`

**What changes:** Two areas need modification:

#### 3.3.1 `handleCheckoutCompleted()` (line ~200)

Currently, the plan type is resolved as `"individual"` or `"business"` only (line 210):

```javascript
// CURRENT
const plan = metadata?.plan || metadata?.planType || "individual";
const planType = plan === "business" ? "business" : "individual";
const policyId = await getPolicyId(planType);
```

The `billingCycle` metadata is already set by the checkout route (line 161 of `checkout/route.js`), but the webhook currently ignores it. Change to:

```javascript
// NEW
const plan = metadata?.plan || metadata?.planType || "individual";
const billingCycle = metadata?.billingCycle || "monthly";
const planType = resolvePlanType(plan, billingCycle);
const policyId = await getPolicyId(planType);
```

Also update the `planName` used for DynamoDB license record creation (currently line ~285 and ~319):

```javascript
// CURRENT
const planName = plan === "business" ? "Business" : "Individual";

// NEW
const planName = `${plan === "business" ? "Business" : "Individual"} ${billingCycle === "annual" ? "Annual" : "Monthly"}`;
```

And store `billingCycle` in the Keygen license metadata (line ~241):

```javascript
metadata: {
  email: customer_email.toLowerCase(),
  stripeCustomerId: customer,
  stripeSubscriptionId: subscription,
  plan,
  billingCycle,        // ← NEW
  seats: String(seats),
},
```

#### 3.3.2 `handleSubscriptionUpdated()` (line ~446)

This is the most significant new logic. When a user switches billing intervals via Stripe Customer Portal (monthly → annual or vice versa), Stripe fires a `customer.subscription.updated` event. We need to detect the interval change and update the Keygen policy accordingly.

Add billing interval change detection after the seat sync block (around line ~550):

```javascript
// Detect billing interval change (monthly ↔ annual)
try {
  const currentItem = items?.data?.[0];
  const currentInterval = currentItem?.plan?.interval; // "month" or "year"

  if (currentInterval && dbCustomer.keygenLicenseId) {
    // Determine what the license's current billing cycle should be
    const newBillingCycle = currentInterval === "year" ? "annual" : "monthly";
    const currentPlan = dbCustomer.accountType || "individual";
    const newPlanType = resolvePlanType(currentPlan, newBillingCycle);
    const newPolicyId = await getPolicyId(newPlanType);

    // Retrieve the current license to check its policy
    const currentLicense = await getLicense(dbCustomer.keygenLicenseId);
    const currentPolicyId = currentLicense?.policyId;

    if (currentPolicyId && currentPolicyId !== newPolicyId) {
      await changeLicensePolicy(dbCustomer.keygenLicenseId, newPolicyId);
      log.info(
        "license_policy_changed",
        "License policy updated for billing interval change",
        {
          previousPolicyId: currentPolicyId,
          newPolicyId,
          newBillingCycle,
          plan: currentPlan,
        },
      );
    }
  }
} catch (error) {
  log.warn(
    "billing_interval_change_failed",
    "Failed to update license policy for interval change",
    {
      errorMessage: error?.message,
    },
  );
}
```

**Import additions** at the top of the file:

```javascript
// Add to existing imports from keygen.js:
import { changeLicensePolicy, resolvePlanType, getLicense } from "@/lib/keygen";
```

Note: `getLicense` may already be imported. `changeLicensePolicy` and `resolvePlanType` are new.

---

### 3.4 File: `plg-website/src/app/api/checkout/route.js`

**What changes:** Minor — the checkout metadata already includes `billingCycle` (line 161), so no changes are strictly needed here. However, the `metadata.plan` value is currently just `"individual"` or `"business"`. We are **not** changing this — the resolved 4-part plan type is computed server-side in the webhook handler using `resolvePlanType(plan, billingCycle)`.

**No code changes required in this file.**

---

### 3.5 File: `plg-website/src/app/api/provision-license/route.js`

**What changes:** This file calls `createLicenseForPlan(planType, ...)` at line ~246. Currently it passes `"individual"` or `"business"`. It should also resolve the billing cycle.

```javascript
// CURRENT (line ~236)
const planType = checkoutSession.metadata?.planType || "individual";

// NEW
const plan = checkoutSession.metadata?.planType || "individual";
const billingCycle = checkoutSession.metadata?.billingCycle || "monthly";
const planType = resolvePlanType(plan, billingCycle);
```

**Import addition:** Add `resolvePlanType` to the keygen.js import.

---

### 3.6 File: `plg-website/src/app/api/checkout/verify/route.js`

**What changes:** If this route uses `planType` for license lookup or display, it should also be aware of billing cycle. Let's audit:

Line 58: `const planType = session.metadata?.planType || "individual";`

This is used for display purposes (the "planName" shown to the user). If we want to show "Individual Monthly" vs "Individual Annual", update:

```javascript
const plan = session.metadata?.planType || "individual";
const billingCycle = session.metadata?.billingCycle || "monthly";
const planName = `${plan === "business" ? "Business" : "Individual"} ${billingCycle === "annual" ? "Annual" : "Monthly"}`;
```

**Minor change — display only, no policy logic.**

---

### 3.7 No New Files Required

All changes are modifications to existing files. No new source files need to be created—only new test cases (see Section 4).

---

## 4. Testing Plan

### 4.1 Unit Tests: `plg-website/__tests__/unit/lib/keygen.test.js`

**Existing tests to update:**

1. **`KEYGEN_POLICIES` tests (line ~59):** Currently assert `individual` and `business` properties. Replace with assertions for all 4 properties (`individualMonthly`, `individualAnnual`, `businessMonthly`, `businessAnnual`). Remove any tests for `individual` or `business` keys.

2. **`getPolicyId()` tests (line ~511):** Currently test `"individual"` and `"business"`. Add tests for:
   - `"individualMonthly"` → returns individual monthly policy UUID
   - `"individualAnnual"` → returns individual annual policy UUID
   - `"businessMonthly"` → returns business monthly policy UUID
   - `"businessAnnual"` → returns business annual policy UUID
   - `"individual"` → throws Error (no legacy mapping)
   - `"business"` → throws Error (no legacy mapping)
   - `"unknown"` → throws Error

3. **`createLicenseForPlan()` tests:** Update to test with the 4-key plan types.

**New tests to add:**

4. **`changeLicensePolicy()` tests:**
   - Sends `PUT /licenses/{id}/policy` with correct JSON:API body
   - Returns the updated license object
   - Preserves the license key in the response
   - Handles API errors gracefully

5. **`resolvePlanType()` tests:**
   - `("individual", "monthly")` → `"individualMonthly"`
   - `("individual", "annual")` → `"individualAnnual"`
   - `("business", "monthly")` → `"businessMonthly"`
   - `("business", "annual")` → `"businessAnnual"`
   - `("individual", undefined)` → `"individualMonthly"` (default)
   - `("unknown", "monthly")` → `"unknownMonthly"` (caller handles validation)

### 4.2 Unit Tests: `plg-website/__tests__/unit/webhooks/stripe.test.js`

**New tests for `handleCheckoutCompleted()`:**

1. **Checkout with billing cycle metadata:**
   - Individual monthly checkout → uses `individualMonthly` policy
   - Individual annual checkout → uses `individualAnnual` policy
   - Business monthly checkout → uses `businessMonthly` policy
   - Business annual checkout → uses `businessAnnual` policy
   - Checkout with no `billingCycle` in metadata → defaults to monthly

2. **Checkout stores billingCycle in Keygen metadata:**
   - Verify that `billingCycle` is included in the license `metadata` passed to `createLicense()`

**New tests for `handleSubscriptionUpdated()`:**

3. **Billing interval change detection:**
   - Monthly → annual: calls `changeLicensePolicy()` with the annual policy UUID
   - Annual → monthly: calls `changeLicensePolicy()` with the monthly policy UUID
   - No interval change (same interval): does NOT call `changeLicensePolicy()`
   - Customer has no keygenLicenseId: skips policy change gracefully
   - `changeLicensePolicy()` fails: logs warning, doesn't throw

4. **Plan tier change detection (future-proofing):**
   - Individual → Business with interval change: uses correct combined policy

### 4.3 Unit Tests: `plg-website/__tests__/unit/lib/secrets.test.js`

(If this file exists — otherwise create it)

1. **`getKeygenPolicyIds()` returns 4 policy IDs:**
   - All 4 env vars set → returns `{ individualMonthly, individualAnnual, businessMonthly, businessAnnual }`
   - Any of the 4 env vars missing → throws (fail loudly, no fallback)
   - No env vars set → throws

### 4.4 Property Tests: `plg-website/__tests__/property/webhooks/stripe.property.test.js`

**Update existing property tests to account for billing cycle:**

1. **Plan type resolution is deterministic:** For any combination of `(plan, billingCycle)`, `resolvePlanType()` always returns the same value.
2. **Policy resolution is total:** Every valid `(plan, billingCycle)` pair maps to a non-null policy ID.

### 4.5 Integration / E2E Tests

**File: `plg-website/__tests__/e2e/journeys/j8-subscription-lifecycle.test.js`**

Add new scenarios:

1. **Monthly checkout → annual upgrade → verify policy change:**
   - Simulate checkout with `billingCycle: "monthly"`
   - Simulate `customer.subscription.updated` with `plan.interval: "year"`
   - Assert `changeLicensePolicy()` was called with annual policy UUID
   - Assert license key is unchanged

2. **Annual checkout → monthly downgrade → verify policy change:**
   - Same as above but in reverse

3. **Billing cycle change with policy change failure:**
   - Simulate `changeLicensePolicy()` throwing an error
   - Assert the webhook handler still completes successfully (non-fatal)
   - Assert warning was logged

### 4.6 Regression Test: Existing Flows Unchanged

Run the full test suite (currently 2028 tests) and verify:

- All updated tests pass with the new 4-policy names
- No references to the old 2-key `individual`/`business` policy names remain in production code
- `getPolicyId("individual")` correctly throws (verifying no legacy callers slipped through)

---

## 5. Rollout Plan

### Phase 1: Keygen Dashboard + SSM (Manual — SWR)

This is an atomic cutover. All steps happen together before the code deploy.

1. Rename existing policies: Individual → Individual Monthly, Business → Business Monthly
2. Update existing policy durations to 44 days (3,801,600 seconds)
3. Set `transferStrategy` = `RESET_EXPIRY` on all 4 policies
4. Create 2 new policies: Individual Annual (379d), Business Annual (379d)
5. Record all 4 policy UUIDs
6. **Transfer SWR's Business Annual license** to the new "Business Annual" policy via Keygen dashboard (Licenses → select license → Change Policy)
7. Add 4 new SSM parameters with the 4 new-name keys
8. Delete the 2 old SSM parameters (`KEYGEN_POLICY_ID_INDIVIDUAL`, `KEYGEN_POLICY_ID_BUSINESS`)
9. Update `.env.local` with 4 new env vars; remove 2 old ones

### Phase 2: Code Changes (Agent)

1. Update `secrets.js`, `keygen.js`, `stripe/route.js`, `provision-license/route.js`, `checkout/verify/route.js`
2. Add `changeLicensePolicy()` and `resolvePlanType()` to keygen.js
3. Remove all references to old `individual`/`business` 2-key policy names
4. Write all new tests (Section 4)
5. Run full test suite — verify 100% pass rate

### Phase 3: Deploy to Staging

1. Push to `development`, verify CI passes
2. Deploy to staging via `update-lambdas.sh staging`
3. Manually test: create Individual Monthly subscription, verify license with 44-day duration
4. Manually test: create Individual Annual subscription, verify license with 379-day duration
5. Verify SWR's existing Business Annual license validates correctly

### Phase 4: Deploy to Production

1. Merge `development` → `main`
2. Deploy to production
3. Verify SSM parameters are live
4. Monitor first few checkouts and renewals

No Phase 5/6 cleanup needed — the old names are already gone.

---

## 6. Risk Assessment

| Risk                                            | Likelihood | Impact   | Mitigation                                                                                |
| ----------------------------------------------- | ---------- | -------- | ----------------------------------------------------------------------------------------- |
| Policy change invalidates license keys          | None       | Critical | Keygen API guarantees keys are immutable (verified in docs)                               |
| Policy change deactivates machines              | None       | Critical | Keygen's Change Policy endpoint preserves machines (verified in docs)                     |
| Existing monthly subscribers affected           | Low        | Medium   | Renaming policies doesn't affect existing licenses; only duration changes on next renewal |
| SSM parameters not propagated                   | Low        | High     | Fail loudly (no fallback); verify SSM before deploying code                               |
| `handleSubscriptionUpdated` misdetects interval | Low        | Medium   | Only triggers policy change when `currentPolicyId !== newPolicyId`                        |
| Stripe metadata missing `billingCycle`          | Low        | Low      | Default to `"monthly"` — same as current behavior                                         |

---

## 7. Summary of Changes

| File                                                                   | Type of Change                                                                              | Lines Affected (est.) |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------- |
| `plg-website/src/lib/secrets.js`                                       | Modify SSM paths + `getKeygenPolicyIds()`                                                   | ~25 lines             |
| `plg-website/src/lib/keygen.js`                                        | Modify `KEYGEN_POLICIES`, `getPolicyId()`; add `changeLicensePolicy()`, `resolvePlanType()` | ~40 lines             |
| `plg-website/src/app/api/webhooks/stripe/route.js`                     | Modify `handleCheckoutCompleted()`, `handleSubscriptionUpdated()`                           | ~30 lines             |
| `plg-website/src/app/api/provision-license/route.js`                   | Modify planType resolution                                                                  | ~5 lines              |
| `plg-website/src/app/api/checkout/verify/route.js`                     | Modify planName display                                                                     | ~5 lines              |
| `plg-website/__tests__/unit/lib/keygen.test.js`                        | Update + add tests                                                                          | ~80 lines             |
| `plg-website/__tests__/unit/webhooks/stripe.test.js`                   | Add billing interval tests                                                                  | ~60 lines             |
| `plg-website/__tests__/e2e/journeys/j8-subscription-lifecycle.test.js` | Add interval change scenarios                                                               | ~40 lines             |
| **Total**                                                              |                                                                                             | **~285 lines**        |

No new source files. ~105 lines of production code changes, ~180 lines of test code.
