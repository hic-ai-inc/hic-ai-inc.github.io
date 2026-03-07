# Appendix B: License Status Flow Scenarios

**Date:** March 6, 2026
**Parent Document:** `docs/plg/20260306_CONSOLIDATED_STATUS_REMEDIATION_PLAN_V3.md`
**Purpose:** Trace every license status transition across realistic user journeys, including failure modes, timing dependencies, and terminal states. Each scenario shows the exact event sequence across Stripe, our webhooks, DynamoDB, Keygen, and the Extension.

---

## Terminology

- **DDB** = DynamoDB (our source of truth for reads)
- **KG** = Keygen (write-only mutations; webhook confirmations flow back)
- **Ext** = Mouse VS Code Extension (heartbeat client)
- **`→`** = causes / triggers
- **`⚡`** = failure point in the scenario
- **Terminal states are in ALL CAPS** at the end of each scenario

## Current Stripe Dunning Behavior (as configured)

Stripe's Smart Retries attempt failed payments up to 3 times over ~7 days. During retries, the subscription status is `past_due`. If all retries fail, the subscription moves to `unpaid`. Stripe fires `customer.subscription.deleted` when the subscription is finally canceled (either by Stripe after exhausting retries, or by us via API). Our `MAX_PAYMENT_FAILURES = 3` threshold triggers suspension after 3 failed attempts.

---

## Happy Path Scenarios

### Scenario 1: Normal Monthly Renewal (Everything Works)

The most common path. User has an active monthly subscription, payment succeeds on time.

```
Day 30: Stripe charges card
  1. Stripe fires `invoice.payment_succeeded`
  2. Our webhook: handlePaymentSucceeded
     → DDB: updateLicenseStatus(licenseId, "active", { expiresAt })
     → KG mutation: renewLicense(licenseId)  [NEW — V3 adds this]
     → KG fires `license.renewed` webhook back to us
     → DDB: updateLicenseStatus(licenseId, "active", { expiresAt, renewedAt })
  3. Ext heartbeat (next cycle, within 10 min):
     → Reads DDB: status = "active" → valid: true
```

Terminal: **ACTIVE**

Note: Steps 2 and the KG webhook (step 2→KG→DDB) may arrive in either order. Both write `"active"` so the order doesn't matter. The KG webhook is a confirmation, not the source of truth.

---

### Scenario 2: Normal Annual Renewal

Identical to Scenario 1 but on a 365-day cycle. The only difference is the Keygen policy duration (368 days vs 33 days). The `renewLicense` call extends by the policy's configured duration automatically.

Terminal: **ACTIVE**

---

### Scenario 3: New Customer — Purchase Through Checkout

```
  1. User completes Stripe Checkout
  2. Stripe fires `checkout.session.completed`
     → Our webhook: handleCheckoutCompleted
     → DDB: create CUSTOMER# record (status: "active")
     → DDB: create LICENSE# record
     → KG mutation: createLicense → returns licenseId
     → DDB: store keygenLicenseId on CUSTOMER# and LICENSE#
  3. User installs extension, enters license key
  4. Ext calls POST /api/license/validate
     → DDB: getLicenseByKey → LICENSE# record (status: "active")
     → Returns valid: true
  5. Ext starts heartbeat cycle
```

Terminal: **ACTIVE**

---

### Scenario 4: Trial → Purchase Conversion

```
  1. User installs extension (no license key)
  2. Ext calls POST /api/license/validate (fingerprint only, no licenseKey)
     → DDB: createTrial (14-day clock, local to extension)
     → Returns valid: true, status: "trial"
  3. Day 1–14: Ext heartbeat validates trial locally (no server calls for trial status)
  4. User purchases before trial expires → Scenario 3 from step 1
  5. User enters license key in extension
     → Ext calls POST /api/license/validate with licenseKey
     → DDB: getLicenseByKey → active license
     → Returns valid: true, status: "active"
```

Terminal: **ACTIVE**

---

### Scenario 5: Trial Expires Without Purchase

```
  1. User installs extension, trial starts (14-day local clock)
  2. Day 14: Extension's local trial timer expires
     → Ext shows "Trial expired. Please purchase a license."
     → Ext calls POST /api/license/validate (fingerprint only)
     → DDB: getTrialByFingerprint → expiresAt < now
     → Returns valid: false, code: "TRIAL_EXPIRED"
  3. Mouse tools disabled. No server-side status change (trials are extension-local).
```

Terminal: **TRIAL_EXPIRED** (extension-local; no DDB/KG state)

---

## Payment Failure & Recovery Scenarios

### Scenario 6: Payment Fails Once, Succeeds on Stripe Retry

```
Day 30: Stripe charges card → declined
  1. Stripe fires `invoice.payment_failed` (attempt_count: 1)
  2. Our webhook: handlePaymentFailed
     → DDB: updateCustomerSubscription(status: "past_due", paymentFailureCount: 1)
     → DDB: updateLicenseStatus(licenseId, "past_due")
     → Event: PAYMENT_FAILED → email sent ("Update your payment method")
  3. Ext heartbeat (next cycle):
     → DDB: license.status = "past_due"
     → Returns valid: true, status: "past_due"
     → Ext shows warning but does NOT disable Mouse tools
       (past_due is a grace period — user retains full access)

Day 31–33: Stripe Smart Retry succeeds
  4. Stripe fires `invoice.payment_succeeded`
  5. Our webhook: handlePaymentSucceeded
     → DDB: updateLicenseStatus(licenseId, "active", { expiresAt })
     → DDB: updateCustomerSubscription(status: "active", event: SUBSCRIPTION_REACTIVATED)
     → KG mutation: renewLicense(licenseId)
  6. Ext heartbeat: status = "active" → valid: true, warning cleared
```

Terminal: **ACTIVE**

Key timing note: The user never loses access. `past_due` is a grace period. Mouse tools remain functional throughout.

---

### Scenario 7: Payment Fails 3 Times → Suspension → User Fixes Card → Recovery

```
Day 30: First failure
  1. Stripe fires `invoice.payment_failed` (attempt_count: 1)
  2. handlePaymentFailed → DDB: "past_due", failureCount: 1
     → PAYMENT_FAILED email #1

Day 33: Second failure (Stripe retry)
  3. Stripe fires `invoice.payment_failed` (attempt_count: 2)
  4. handlePaymentFailed → DDB: "past_due", failureCount: 2
     → PAYMENT_FAILED email #2

Day 37: Third failure (Stripe retry)
  5. Stripe fires `invoice.payment_failed` (attempt_count: 3)
  6. handlePaymentFailed:
     → DDB: "past_due", failureCount: 3
     → attempt_count >= MAX_PAYMENT_FAILURES (3)
     → DDB: updateCustomerSubscription(status: "payment_suspended")  [V3 disambiguation]
     → DDB: updateLicenseStatus(licenseId, "payment_suspended")
     → KG mutation: suspendLicense(licenseId)
     → KG fires `license.suspended` webhook
     → DDB: confirms "payment_suspended", event: LICENSE_PAYMENT_SUSPENDED
     → Email: licensePaymentSuspended ("Action Required: Update Your Payment Method")
  7. Ext heartbeat:
     → DDB: license.status = "payment_suspended"
     → Returns valid: false, status: "payment_suspended"
     → Ext: _handleLicensePaymentSuspended → "Payment issue. Update your payment method." + billing link
     → Mouse tools DISABLED

Day 40: User updates card in Stripe portal, Stripe retries successfully
  8. Stripe fires `invoice.payment_succeeded`
  9. handlePaymentSucceeded:
     → dbCustomer.subscriptionStatus === "payment_suspended"
     → DDB: updateCustomerSubscription(status: "active", event: SUBSCRIPTION_REACTIVATED)
     → DDB: updateLicenseStatus(licenseId, "active", { expiresAt })
     → KG mutation: reinstateLicense(licenseId)  [reinstate BEFORE renew]
     → KG mutation: renewLicense(licenseId)
     → KG fires `license.reinstated` webhook → DDB: "active"
     → KG fires `license.renewed` webhook → DDB: "active", new expiresAt
  10. Ext heartbeat:
      → DDB: status = "active" → valid: true
      → Mouse tools RE-ENABLED
```

Terminal: **ACTIVE**

Key timing: User loses access from step 7 (suspension) to step 10 (next heartbeat after reinstatement). Maximum delay = heartbeat interval (10 minutes).

---

### Scenario 8: Payment Fails 3 Times → Suspension → User Never Fixes → Stripe Cancels

```
Steps 1–7: Same as Scenario 7 (suspended at Day 37)

Day 37+: Stripe exhausts all retries
  8. Stripe fires `customer.subscription.deleted`
  9. handleSubscriptionDeleted:
     → priorStatus = "payment_suspended"
     → expirationEventType = "NONPAYMENT_CANCELLATION_EXPIRED"
     → DDB: updateCustomerSubscription(status: "expired", event: NONPAYMENT_CANCELLATION_EXPIRED)
     → DDB: updateLicenseStatus(licenseId, "expired")
     → KG mutation: suspendLicense(licenseId)  [already suspended, idempotent]
  10. Ext heartbeat:
      → DDB: status = "expired" → valid: false, status: "expired"
      → Ext shows "License expired" message
      → Mouse tools remain DISABLED
```

Terminal: **EXPIRED**

Note: The user was already suspended (no access) from Day 37. The transition to "expired" is a bookkeeping change — it doesn't change the user's experience, but it closes the record.

---

### Scenario 9: Payment Fails Once → User Proactively Updates Card Before Retry

```
Day 30: First failure
  1. Stripe fires `invoice.payment_failed` (attempt_count: 1)
  2. handlePaymentFailed → DDB: "past_due", failureCount: 1
     → PAYMENT_FAILED email

Day 31: User updates card in Stripe portal
  3. Stripe fires `customer.subscription.updated` (status: "active")
     → handleSubscriptionUpdated: statusMap["active"] = "active"
     → DDB: updateCustomerSubscription(status: "active")
     → DDB: updateLicenseStatus(licenseId, "active")
     → dbCustomer.subscriptionStatus was "past_due", now "active"
     → KG: no action needed (license was never suspended in KG)

  4. Stripe retries the outstanding invoice with new card → succeeds
  5. Stripe fires `invoice.payment_succeeded`
     → handlePaymentSucceeded:
     → DDB: updateLicenseStatus(licenseId, "active", { expiresAt })
     → KG mutation: renewLicense(licenseId)
```

Terminal: **ACTIVE**

Key point: User never lost access. `past_due` is a grace period with full functionality.

---

## Cancellation Scenarios

### Scenario 10: Voluntary Cancellation (User Cancels, Rides Out Period)

```
Day 15 of billing cycle: User clicks "Cancel" in Stripe portal
  1. Stripe fires `customer.subscription.updated` (cancel_at_period_end: true, status: "active")
  2. handleSubscriptionUpdated:
     → cancel_at_period_end = true
     → DDB: updateCustomerSubscription(status: "cancellation_pending", event: CANCELLATION_REQUESTED)
     → Email: cancellationRequested ("Your subscription will end on [date]")
  3. Ext heartbeat: status = "cancellation_pending" → valid: true
     → Mouse tools remain ACTIVE (user paid through end of period)

Day 30: Billing period ends
  4. Stripe fires `customer.subscription.deleted`
  5. handleSubscriptionDeleted:
     → priorStatus = "cancellation_pending"
     → expirationEventType = "VOLUNTARY_CANCELLATION_EXPIRED"
     → DDB: updateCustomerSubscription(status: "expired", event: VOLUNTARY_CANCELLATION_EXPIRED)
     → DDB: updateLicenseStatus(licenseId, "expired")
     → KG mutation: suspendLicense(licenseId)
  6. Ext heartbeat: status = "expired" → valid: false
     → Mouse tools DISABLED
```

Terminal: **EXPIRED**

---

### Scenario 11: Voluntary Cancellation → User Changes Mind Before Period Ends

```
Day 15: User cancels (same as Scenario 10, steps 1–3)
  → DDB: "cancellation_pending"

Day 20: User clicks "Don't Cancel" in Stripe portal
  1. Stripe fires `customer.subscription.updated` (cancel_at_period_end: false)
  2. handleSubscriptionUpdated:
     → cancel_at_period_end = false AND dbCustomer.cancelAtPeriodEnd = true
     → DDB: updateCustomerSubscription(status: "active", event: CANCELLATION_REVERSED)
     → Email: cancellationReversed ("Your subscription has been restored")
  3. Ext heartbeat: status = "active" → valid: true (was never interrupted)

Day 30: Normal renewal → Scenario 1
```

Terminal: **ACTIVE**

---

## Admin Scenarios (Business Tier)

### Scenario 12: Admin Suspends Team Member

```
  1. Admin clicks "Suspend" on team member in portal
  2. PUT /api/portal/team (action: update_status, status: "admin_suspended")
     → DDB: update MEMBER# record (status: "admin_suspended")
     → Event: MEMBER_SUSPENDED
     → Email: memberSuspended ("Your access via [OrgName] has been suspended")
  3. Member's Ext heartbeat:
     → DDB: member status = "admin_suspended"
     → Returns valid: false, status: "admin_suspended"
     → Ext: _handleLicenseAdminSuspended
       → "Your access has been suspended by your organization administrator"
       → No billing link (member can't fix this)
     → Mouse tools DISABLED
```

Terminal: **ADMIN_SUSPENDED**

Note: The organization's license itself remains active. Only the member's access is suspended. Other team members are unaffected.

---

### Scenario 13: Admin Reactivates Previously Suspended Member

```
  1. Admin clicks "Reactivate" on suspended member
  2. PUT /api/portal/team (action: update_status, status: "active")
     → DDB: update MEMBER# record (status: "active")
     → Event: MEMBER_REACTIVATED  [NEW — V3 adds this event write]
     → Email: memberReactivated ("Your access via [OrgName] has been restored")
  3. Member's Ext heartbeat:
     → DDB: member status = "active"
     → Returns valid: true, status: "active"
     → Mouse tools RE-ENABLED
```

Terminal: **ACTIVE**

---

### Scenario 14: Admin Revokes Team Member

```
  1. Admin clicks "Revoke" on team member
  2. PUT /api/portal/team (action: update_status, status: "admin_revoked")
     → DDB: update MEMBER# record (status: "admin_revoked")
     → Event: MEMBER_REVOKED
     → Email: memberRevoked ("Your access via [OrgName] has been revoked")
  3. Member's Ext heartbeat:
     → DDB: member status = "admin_revoked"
     → Returns valid: false, status: "admin_revoked"
     → Mouse tools DISABLED
```

Terminal: **ADMIN_REVOKED**

Note: Unlike suspension, revocation is intended to be permanent (member removed from team). The admin can still reactivate if needed (same as Scenario 13), but the intent is different.

---

## Keygen-Specific Failure Scenarios

### Scenario 15: Payment Succeeds but `renewLicense` Keygen Call Fails

```
Day 30: Stripe charges card → succeeds
  1. Stripe fires `invoice.payment_succeeded`
  2. handlePaymentSucceeded:
     → DDB: updateLicenseStatus(licenseId, "active", { expiresAt }) ✓
     → KG mutation: renewLicense(licenseId) ⚡ FAILS (Keygen API timeout/500)
     → Caught by try/catch, logged as warning
     → DDB is already correct — user has "active" status
  3. Ext heartbeat: DDB status = "active" → valid: true
     → User retains full access (DDB is source of truth, not Keygen)

  KEYGEN CLOCK IS NOW DRIFTING:
  Keygen still thinks the license expires at the OLD date (Day 30 + original duration).
  The 3-day buffer (33 days for monthly) means Keygen won't declare it expired until Day 33.

Day 31: Next payment cycle or manual intervention
  4. If another `invoice.payment_succeeded` fires (e.g., proration, manual charge):
     → renewLicense retried → succeeds → Keygen clock corrected
  OR
  5. If no payment event fires before Day 33:
     → Keygen fires `license.expired` webhook
     → handleLicenseExpired: DDB: updateLicenseStatus(licenseId, "expired")
     → ⚠️ THIS OVERWRITES THE CORRECT "active" STATUS IN DDB
```

Terminal: **ACTIVE** (if renewLicense succeeds on retry before buffer expires)
Terminal: **EXPIRED** (if buffer expires — this is a real risk, see note below)

**⚠️ OPEN ISSUE:** If `renewLicense` fails AND no subsequent payment event retries it within the 3-day buffer, the Keygen `license.expired` webhook will overwrite DDB with "expired" even though the Stripe subscription is active. The V3 plan does not include a reconciliation job or retry mechanism for this case. The 3-day buffer is the only backstop. This scenario is unlikely (requires both a Keygen API failure AND no subsequent payment events for 3 days) but not impossible. A future SQS queue for Keygen mutations (listed in V3 Section 5 as deferred) would address this.

---

### Scenario 16: Keygen Webhook Endpoint Is Down When License Expires

```
Day 33: Keygen policy duration expires (renewLicense never called — Scenario 15 precondition)
  1. Keygen fires `license.expired` webhook to our endpoint
  2. ⚡ Our endpoint returns 500 (deployment issue, cold start, etc.)
  3. Keygen retries webhook (Keygen retries failed webhooks with exponential backoff)
  4. Eventually our endpoint recovers:
     → handleLicenseExpired: DDB: updateLicenseStatus(licenseId, "expired")

  Meanwhile:
  5. Ext heartbeat reads DDB directly
     → If DDB still says "active" (webhook hasn't landed yet): valid: true
     → If DDB updated to "expired": valid: false
```

Terminal: Depends on whether the Stripe subscription is actually active. If it is, this is a false expiration (same issue as Scenario 15). If the subscription genuinely ended, "expired" is correct.

---

### Scenario 17: Keygen Is Completely Down During Suspension

```
Day 37: Third payment failure triggers suspension
  1. handlePaymentFailed:
     → DDB: "payment_suspended" ✓
     → KG mutation: suspendLicense(licenseId) ⚡ FAILS
     → Caught by try/catch, logged as warning
  2. Ext heartbeat: DDB status = "payment_suspended" → valid: false
     → Mouse tools DISABLED (correct — DDB is source of truth)

  Keygen still thinks the license is active. This is a cosmetic inconsistency:
  - DDB (our source of truth) says suspended → user has no access
  - Keygen says active → irrelevant, we don't read from Keygen

  When Keygen recovers:
  3. No automatic reconciliation. Keygen status remains stale until the next
     mutation (reinstate, renew, etc.) or a future reconciliation job.
```

Terminal: **PAYMENT_SUSPENDED** (correct behavior — DDB governs access)

Note: The Keygen inconsistency is cosmetic. It only matters for the Keygen dashboard view and the metrics script. It does NOT affect user access.

---

## Dispute Scenarios

### Scenario 18: Chargeback Dispute Filed → Won by Merchant

```
  1. Stripe fires `charge.dispute.created`
  2. handleDisputeCreated:
     → DDB: updateCustomerSubscription(status: "disputed", event: LICENSE_DISPUTED)
     → DDB: updateLicenseStatus(licenseId, "disputed")
  3. Ext heartbeat: status = "disputed" → valid: false
     → Mouse tools DISABLED

  Weeks later: Dispute resolved in our favor
  4. Stripe fires `charge.dispute.closed` (status: "won")
  5. handleDisputeClosed:
     → dispute.status === "won"
     → DDB: updateCustomerSubscription(status: "active", event: DISPUTE_RESOLVED)
     → DDB: updateLicenseStatus(licenseId, "active")
     → KG mutation: reinstateLicense(licenseId)
  6. Ext heartbeat: status = "active" → valid: true
     → Mouse tools RE-ENABLED
```

Terminal: **ACTIVE**

---

### Scenario 19: Chargeback Dispute Filed → Lost by Merchant

```
Steps 1–3: Same as Scenario 18 (disputed, tools disabled)

  Weeks later: Dispute resolved in customer's favor (we lost)
  4. Stripe fires `charge.dispute.closed` (status: "lost")
  5. handleDisputeClosed:
     → dispute.status !== "won"
     → DDB: updateCustomerSubscription(status: "payment_suspended", event: LICENSE_PAYMENT_SUSPENDED)
     → DDB: updateLicenseStatus(licenseId, "payment_suspended")
     → KG mutation: suspendLicense(licenseId)
  6. Ext heartbeat: status = "payment_suspended" → valid: false
     → Mouse tools remain DISABLED
```

Terminal: **PAYMENT_SUSPENDED**

Note: The customer got their money back via chargeback. Their license is suspended. They would need to re-subscribe to regain access.

---

## Edge Case Scenarios

### Scenario 20: Race Condition — Heartbeat During Status Transition

```
  1. Stripe fires `invoice.payment_failed` (attempt 3)
  2. handlePaymentFailed begins executing:
     → DDB write #1: status = "past_due" (the initial write)
     → SIMULTANEOUSLY: Ext heartbeat fires
     → Ext reads DDB: status = "past_due" → valid: true (grace period)
  3. handlePaymentFailed continues:
     → attempt_count >= 3
     → DDB write #2: status = "payment_suspended"
  4. Next Ext heartbeat (up to 10 min later):
     → DDB: status = "payment_suspended" → valid: false
```

Terminal: **PAYMENT_SUSPENDED**

Impact: The user gets at most one extra heartbeat cycle (~10 minutes) of access during the transition from past_due to payment_suspended. This is acceptable — the status transition is not instantaneous and the heartbeat interval is the natural consistency boundary.

---

### Scenario 21: Extension Heartbeat When DDB License Record Doesn't Exist

This is the "license not found" defect from V3 Section 3.10.

```
Current behavior (DEFECTIVE):
  1. Ext heartbeat calls POST /api/license/heartbeat
  2. getLicenseByKey returns null
  3. Heartbeat returns { valid: true, status: "active" }  ← WRONG
  → User has full access with no license record

V3 fix:
  1. Ext heartbeat calls POST /api/license/heartbeat
  2. getLicenseByKey returns null
  3. Heartbeat returns { valid: false, status: ??? }
  → Mouse tools DISABLED
```

Terminal: **ERROR** (license not found — user must re-enter key or contact support)

This is the scenario where the `"unknown"` status vs. throwing an error is debatable (Appendix A, Debatable Item D). Either way, the user gets `valid: false`.

---

### Scenario 22: Webhook Events Arrive Out of Order

```
Day 30: Stripe charges card → succeeds
  1. Stripe fires `invoice.payment_succeeded`
  2. Stripe fires `customer.subscription.updated` (status: "active")

  Due to network timing, event #2 arrives BEFORE event #1:
  3. handleSubscriptionUpdated: DDB status = "active" (already was "active" — no-op)
  4. handlePaymentSucceeded: DDB status = "active", expiresAt updated
     → KG: renewLicense

  Result: Correct. Both handlers write "active". Order doesn't matter.
```

Terminal: **ACTIVE**

For the failure case:
```
Day 37: Third payment failure + suspension
  1. handlePaymentFailed fires (attempt 3) → DDB: "payment_suspended"
  2. Stripe fires `customer.subscription.updated` (status: "unpaid")
     → handleSubscriptionUpdated: statusMap["unpaid"] = "suspended"
       [V3 changes this to "payment_suspended"]

  If event #2 arrives before event #1:
  3. handleSubscriptionUpdated: DDB: "payment_suspended"
  4. handlePaymentFailed: DDB: "past_due" then "payment_suspended"
     (the past_due write is immediately overwritten by the suspension write)

  Result: Correct. Final state is "payment_suspended" regardless of order.
```

Terminal: **PAYMENT_SUSPENDED**

---

## Terminal State Summary

| Terminal State | Meaning | User Access | How to Exit |
|---|---|---|---|
| ACTIVE | Subscription current, license valid | Full access | — |
| PAST_DUE | Payment failed, Stripe retrying | Full access (grace period) | Stripe retry succeeds, or user updates card |
| CANCELLATION_PENDING | User requested cancellation | Full access until period end | User reverses cancellation |
| PAYMENT_SUSPENDED | 3+ payment failures or lost dispute | No access | User updates payment method → payment succeeds |
| ADMIN_SUSPENDED | Admin suspended team member | No access | Admin reactivates member |
| ADMIN_REVOKED | Admin revoked team member | No access | Admin reactivates member |
| EXPIRED | Subscription ended (voluntary or nonpayment) | No access | User re-subscribes |
| DISPUTED | Chargeback in progress | No access | Dispute resolved |
| TRIAL_EXPIRED | 14-day trial ended (extension-local) | No access | User purchases license |

---

## Open Issues Identified

1. **Scenario 15 — renewLicense failure + buffer expiration:** If `renewLicense` fails and no payment event retries it within the 3-day Keygen policy buffer, the `license.expired` Keygen webhook will overwrite the correct "active" DDB status. The deferred SQS queue would fix this. Without it, the 3-day buffer is the only backstop.

2. **Scenario 21 — License not found response format:** V3 proposes `"unknown"` status with retry logic. Simon suggested throwing an error instead. Either approach fixes the defect (returning `valid: false`). The question is whether to add the `"unknown"` status machinery or use a simple error response.

3. **handleSubscriptionDeleted calls suspendLicense even when license is already suspended:** In Scenario 8, the license was already suspended at step 7. Step 9 calls `suspendLicense` again. This is idempotent in Keygen (no error), but it's a redundant API call. Low priority.
