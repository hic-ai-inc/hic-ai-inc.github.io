# Appendix B: License Status Flow Scenarios (V4)

**Date:** March 6, 2026
**Parent Document:** `docs/plg/20260306_CONSOLIDATED_STATUS_REMEDIATION_PLAN_V4.md`
**Supersedes:** `docs/plg/20260306_LICENSE_STATUS_FLOW_SCENARIOS_APPENDIX_B.md` (V3)
**Purpose:** Trace every license status transition across realistic user journeys. Each scenario shows the exact event sequence across Stripe, our webhooks, DynamoDB, Keygen, and the Extension.

---

## Terminology

- **DDB** = DynamoDB (sole source of truth for reads)
- **KG** = Keygen (write-only mutations; webhook confirmations flow back)
- **Ext** = Mouse VS Code Extension (heartbeat client)
- **`→`** = causes / triggers
- **`⚡`** = failure point in the scenario

## V4 Payment Path

```
active → past_due (2-week Stripe dunning, tools WORK) → expired (tools BLOCKED)
```

No `"suspended"` state in the payment path. `"suspended"` means only: admin suspended a team member.

## Stripe Dunning Configuration (V4)

- Smart Retries: ON
- Maximum retries: 8
- Maximum duration: 2 weeks
- After all retries fail: Cancel the subscription

## Keygen Policy Durations (V4)

- Monthly: 47 days (30 billing + 14 dunning + 3 buffer)
- Annual: 382 days (365 billing + 14 dunning + 3 buffer)

---

## Happy Path Scenarios

### Scenario 1: Normal Monthly Renewal (Everything Works)

```
April 14 ~2PM: Stripe charges card → SUCCEEDS
  1. Stripe fires invoice.payment_succeeded
  2. handlePaymentSucceeded:
     → DDB: updateLicenseStatus("active", { expiresAt })
     → KG: renewLicense(licenseId) → expiresAt reset to +47 days
  3. Ext heartbeat (next cycle, ≤10 min):
     → DDB: status = "active" → valid: true
```

Terminal: **ACTIVE**

---

### Scenario 2: Normal Annual Renewal

Identical to Scenario 1 but on a 365-day cycle. `renewLicense` extends by 382 days.

Terminal: **ACTIVE**

---

### Scenario 3: New Customer — Purchase Through Checkout

```
  1. User completes Stripe Checkout
  2. Stripe fires checkout.session.completed
     → handleCheckoutCompleted:
     → DDB: create CUSTOMER# (status: "active"), LICENSE# record
     → KG: createLicense → returns licenseId, expiresAt (+47 days monthly)
     → DDB: store keygenLicenseId
  3. User installs extension, enters license key
  4. Ext calls POST /api/license/validate
     → DDB: getLicenseByKey → LICENSE# (status: "active")
     → Returns valid: true
  5. Ext starts heartbeat cycle
```

Terminal: **ACTIVE**

---

### Scenario 4: Trial → Purchase Conversion

```
  1. User installs extension (no license key)
  2. Ext calls POST /api/license/validate (fingerprint only)
     → 14-day trial starts (local to extension)
     → Returns valid: true, status: "trial"
  3. Day 1–14: Ext validates trial locally
  4. User purchases before trial expires → Scenario 3
  5. User enters license key → active
```

Terminal: **ACTIVE**

---

### Scenario 5: Trial Expires Without Purchase

```
  1. Extension trial starts (14-day local clock)
  2. Day 14: Timer expires
     → Ext: "Trial expired. Please purchase a license."
     → Returns valid: false, code: "TRIAL_EXPIRED"
  3. Mouse tools disabled. No server-side state change.
```

Terminal: **TRIAL_EXPIRED** (extension-local; no DDB/KG state)

---

## Payment Failure & Recovery Scenarios

### Scenario 6: Payment Fails Once, Succeeds on Stripe Retry

```
April 14 ~2PM: Stripe charges card → DECLINED
  1. Stripe fires invoice.payment_failed (attempt 1)
  2. handlePaymentFailed:
     → DDB: status = "past_due", paymentFailureCount: 1
     → Email: PAYMENT_FAILED ("Update your payment method")
  3. Ext heartbeat:
     → DDB: "past_due" → valid: true, status: "past_due"
     → Ext shows warning. Mouse tools WORK.

April 15–17: Stripe Smart Retry succeeds
  4. Stripe fires invoice.payment_succeeded
  5. handlePaymentSucceeded:
     → DDB: status = "active", expiresAt updated
     → KG: renewLicense(licenseId)
  6. Ext heartbeat: "active" → valid: true, warning cleared
```

Terminal: **ACTIVE**

---

### Scenario 7: All Retries Fail → Stripe Cancels → Expired

This is the most-unhappy payment path. No intermediate suspension state.

```
March 15, 12:00 PM: Subscription created. KG expiresAt = May 1 (47 days).

April 14 ~2PM: First charge attempt → DECLINED
  1. Stripe fires invoice.payment_failed (attempt 1)
  2. Stripe fires customer.subscription.updated (status: "past_due")
  3. handlePaymentFailed:
     → DDB: "past_due", failureCount: 1
     → Email: PAYMENT_FAILED
  4. Ext heartbeat: "past_due" → valid: true. Tools WORK.
     KG: still active (expiresAt May 1, 17 days remaining)

April 14–28: Stripe Smart Retries (up to 7 more attempts over 2 weeks)
  5. Each failure: invoice.payment_failed → DDB stays "past_due"
  6. Each failure: PAYMENT_FAILED email with retry info
  7. Ext: tools continue to WORK throughout
     KG: still active (expiresAt May 1)

~April 28: Stripe exhausts all retries. Cancels subscription.
  8. Stripe fires customer.subscription.deleted
  9. handleSubscriptionDeleted:
     → priorStatus = "past_due"
     → DDB: status = "expired", event: NONPAYMENT_CANCELLATION_EXPIRED
     → Email: nonpayment cancellation notification
     → KG: suspendLicense(licenseId) [Keygen API concept — revokes access in KG]
  10. Ext heartbeat: "expired" → valid: false. Tools BLOCKED.
      KG: suspended in Keygen (access revoked)

May 1: Keygen policy expires. Fires license.expired webhook.
  11. handleLicenseExpired: DDB already "expired" — idempotent write. No user impact.
```

Terminal: **EXPIRED**

No status ping-pong. No race conditions. DDB is always correct. Keygen expiry is a no-op confirmation.

---

### Scenario 8: Payment Fails → User Fixes Card During Dunning → Recovery

```
April 14: First failure → DDB: "past_due" (same as Scenario 7, steps 1–4)

April 20: User updates card in Stripe portal
  1. Stripe retries with new card → SUCCEEDS
  2. Stripe fires invoice.payment_succeeded
  3. handlePaymentSucceeded:
     → dbCustomer.subscriptionStatus === "past_due"
     → DDB: status = "active", expiresAt updated
     → KG: renewLicense(licenseId) → expiresAt reset
  4. Ext heartbeat: "active" → valid: true. Warning cleared.
```

Terminal: **ACTIVE**

Key: User never lost access. `past_due` is a grace period with full tool functionality.

---

### Scenario 9: Payment Fails → User Proactively Updates Card Before Retry

```
April 14: First failure → DDB: "past_due"

April 15: User updates card in Stripe portal
  1. Stripe fires customer.subscription.updated (status: "active")
  2. handleSubscriptionUpdated: statusMap["active"] = "active"
     → DDB: status = "active"
     → KG: no action needed (license was never suspended in KG)

  3. Stripe retries outstanding invoice with new card → SUCCEEDS
  4. Stripe fires invoice.payment_succeeded
     → handlePaymentSucceeded:
     → DDB: status = "active", expiresAt updated
     → KG: renewLicense(licenseId)
```

Terminal: **ACTIVE**

---

## Cancellation Scenarios

### Scenario 10: Voluntary Cancellation (User Cancels, Rides Out Period)

```
Day 15 of billing cycle: User clicks "Cancel" in Stripe portal
  1. Stripe fires customer.subscription.updated (cancel_at_period_end: true)
  2. handleSubscriptionUpdated:
     → DDB: status = "cancellation_pending", event: CANCELLATION_REQUESTED
     → Email: "Your subscription will end on [date]"
  3. Ext heartbeat: "cancellation_pending" → valid: true. Tools WORK.

Day 30: Billing period ends
  4. Stripe fires customer.subscription.deleted
  5. handleSubscriptionDeleted:
     → priorStatus = "cancellation_pending"
     → DDB: status = "expired", event: VOLUNTARY_CANCELLATION_EXPIRED
     → KG: suspendLicense(licenseId)
  6. Ext heartbeat: "expired" → valid: false. Tools BLOCKED.
```

Terminal: **EXPIRED**

---

### Scenario 11: Voluntary Cancellation → User Changes Mind Before Period Ends

```
Day 15: User cancels → DDB: "cancellation_pending" (Scenario 10, steps 1–3)

Day 20: User clicks "Don't Cancel" in Stripe portal
  1. Stripe fires customer.subscription.updated (cancel_at_period_end: false)
  2. handleSubscriptionUpdated:
     → cancel_at_period_end = false AND dbCustomer.cancelAtPeriodEnd = true
     → DDB: status = "active", event: CANCELLATION_REVERSED
     → Email: "Your subscription has been restored"
  3. Ext heartbeat: "active" → valid: true (was never interrupted)

Day 30: Normal renewal → Scenario 1
```

Terminal: **ACTIVE**

---

## Admin Scenarios (Business Tier)

### Scenario 12: Admin Suspends Team Member

```
  1. Admin clicks "Suspend" on team member in portal
  2. PUT /api/portal/team (action: update_status, status: "suspended")
     → DDB: update MEMBER# record (status: "suspended")
     → Event: MEMBER_SUSPENDED
  3. Member's Ext heartbeat:
     → DDB: member status = "suspended"
     → Returns valid: false, status: "suspended"
     → Mouse tools DISABLED
```

Terminal: **SUSPENDED** (admin-only; unambiguous in V4)

---

### Scenario 13: Admin Reactivates Previously Suspended Member

```
  1. Admin clicks "Reactivate" on suspended member
  2. PUT /api/portal/team (action: update_status, status: "active")
     → DDB: update MEMBER# record (status: "active")
  3. Member's Ext heartbeat:
     → DDB: member status = "active" → valid: true
     → Mouse tools RE-ENABLED
```

Terminal: **ACTIVE**

---

### Scenario 14: Admin Revokes Team Member

```
  1. Admin clicks "Revoke" on team member
  2. PUT /api/portal/team (action: update_status, status: "revoked")
     → DDB: update MEMBER# record (status: "revoked")
     → Event: MEMBER_REVOKED
  3. Member's Ext heartbeat:
     → DDB: member status = "revoked" → valid: false
     → Mouse tools DISABLED
```

Terminal: **REVOKED**

---

## Keygen-Specific Failure Scenarios

### Scenario 15: Payment Succeeds but `renewLicense` Keygen Call Fails

```
April 14: Stripe charges card → SUCCEEDS
  1. Stripe fires invoice.payment_succeeded
  2. handlePaymentSucceeded:
     → DDB: status = "active", expiresAt updated ✓
     → KG: renewLicense(licenseId) ⚡ FAILS (timeout/500)
     → Caught by try/catch, logged as warning
     → DDB is correct — user has "active" status
  3. Ext heartbeat: DDB "active" → valid: true. User retains full access.

  KEYGEN CLOCK IS NOW DRIFTING:
  KG still thinks license expires at original date.
  The 17-day buffer (47 - 30) means KG won't expire it before next billing cycle.

Next billing cycle (May 14):
  4. invoice.payment_succeeded fires again
     → renewLicense retried → succeeds → KG clock corrected

  OR if renewLicense keeps failing:
  5. May 1 (47 days after March 15): KG fires license.expired webhook
     → handleLicenseExpired: DDB: "expired"
     → ⚠️ OVERWRITES correct "active" status
```

Terminal: **ACTIVE** (if renewLicense succeeds on next billing cycle)
Terminal: **EXPIRED** (if buffer expires — requires renewLicense to fail for 17+ consecutive days)

**⚠️ KNOWN RISK:** If `renewLicense` fails AND no payment event retries it within the 17-day buffer, the Keygen `license.expired` webhook overwrites the correct "active" DDB status. The 17-day buffer (vs V3's 3-day buffer) makes this significantly less likely. A future SQS queue for Keygen mutations (deferred, V4 Section 5) would eliminate this risk entirely.

---

### Scenario 16: Keygen Webhook Endpoint Is Down When License Expires

```
May 1: KG policy expires (renewLicense never called — Scenario 15 precondition)
  1. KG fires license.expired webhook
  2. ⚡ Our endpoint returns 500
  3. KG retries with exponential backoff
  4. Endpoint recovers → handleLicenseExpired: DDB: "expired"

  Meanwhile:
  5. Ext heartbeat reads DDB directly
     → If DDB still says "active": valid: true (webhook hasn't landed)
     → If DDB updated to "expired": valid: false
```

Terminal: Depends on whether Stripe subscription is actually active. If it is, this is a false expiration (same as Scenario 15). If subscription genuinely ended, "expired" is correct.

---

### Scenario 17: Keygen Is Down During Subscription Deletion

```
~April 28: Stripe cancels subscription after dunning
  1. handleSubscriptionDeleted:
     → DDB: "expired" ✓
     → KG: suspendLicense(licenseId) ⚡ FAILS
     → Caught by try/catch, logged as warning
  2. Ext heartbeat: DDB "expired" → valid: false. Tools BLOCKED. (Correct.)

  KG still thinks license is active. Cosmetic inconsistency:
  - DDB (source of truth) says "expired" → user has no access
  - KG says active → irrelevant, we don't read from KG

  When KG recovers:
  3. No automatic reconciliation. KG status remains stale until next mutation
     or future reconciliation job.
```

Terminal: **EXPIRED** (correct — DDB governs access)

---

## Dispute Scenarios

### Scenario 18: Chargeback Dispute Filed → Won by Merchant

```
  1. Stripe fires charge.dispute.created
  2. handleDisputeCreated:
     → DDB: status = "disputed"
  3. Ext heartbeat: "disputed" → valid: false. Tools DISABLED.

  Weeks later: Dispute resolved in our favor
  4. Stripe fires charge.dispute.closed (status: "won")
  5. handleDisputeClosed:
     → DDB: status = "active"
     → KG: reinstateLicense(licenseId)
  6. Ext heartbeat: "active" → valid: true. Tools RE-ENABLED.
```

Terminal: **ACTIVE**

---

### Scenario 19: Chargeback Dispute Filed → Lost by Merchant

```
Steps 1–3: Same as Scenario 18 (disputed, tools disabled)

  Dispute resolved in customer's favor (we lost)
  4. Stripe fires charge.dispute.closed (status: "lost")
  5. handleDisputeClosed:
     → DDB: status = "expired"
     → KG: suspendLicense(licenseId)
  6. Ext heartbeat: "expired" → valid: false. Tools remain DISABLED.
```

Terminal: **EXPIRED**

Note: Customer got their money back via chargeback. License expires. They would need to re-subscribe.

---

## Edge Case Scenarios

### Scenario 20: Race Condition — Heartbeat During `past_due` → `expired` Transition

```
~April 28: Stripe cancels subscription
  1. customer.subscription.deleted arrives
  2. handleSubscriptionDeleted begins executing
     → SIMULTANEOUSLY: Ext heartbeat fires
     → Ext reads DDB: status = "past_due" → valid: true (grace period still showing)
  3. handleSubscriptionDeleted completes:
     → DDB: status = "expired"
  4. Next Ext heartbeat (≤10 min later):
     → DDB: "expired" → valid: false. Tools BLOCKED.
```

Terminal: **EXPIRED**

Impact: User gets at most one extra heartbeat cycle (~10 min) of `past_due` access during the transition. Benign — they were already in the grace period.

---

### Scenario 21: Heartbeat When License Record Doesn't Exist in DDB

This is the "license not found" defect fixed in V4 Step 3.10.

```
Current behavior (DEFECTIVE):
  1. Ext heartbeat calls POST /api/license/heartbeat
  2. getLicenseByKey returns null
  3. Returns { valid: true, status: "active" }  ← WRONG
  → User has full access with no license record

V4 fix:
  1. Ext heartbeat calls POST /api/license/heartbeat
  2. getLicenseByKey returns null
  3. Returns { valid: false, error: "License not found" } with HTTP 404
  → Mouse tools DISABLED
```

Terminal: **ERROR** (license not found — user must re-enter key or contact support)

---

### Scenario 22: Webhook Events Arrive Out of Order (Happy Path)

```
April 14: Stripe charges card → SUCCEEDS
  1. Stripe fires invoice.payment_succeeded
  2. Stripe fires customer.subscription.updated (status: "active")

  Event #2 arrives BEFORE event #1:
  3. handleSubscriptionUpdated: DDB "active" (already "active" — no-op)
  4. handlePaymentSucceeded: DDB "active", expiresAt updated, KG: renewLicense

  Result: Correct. Both write "active". Order doesn't matter.
```

Terminal: **ACTIVE**

---

### Scenario 23: Webhook Events Arrive Out of Order (Failure Path)

```
~April 28: Stripe cancels subscription after dunning
  1. Stripe fires customer.subscription.deleted
  2. A late invoice.payment_failed also arrives

  Event #2 arrives BEFORE event #1:
  3. handlePaymentFailed: DDB "past_due" (or skipped if guard sees "expired")
  4. handleSubscriptionDeleted: DDB "expired"

  Event #1 arrives BEFORE event #2:
  5. handleSubscriptionDeleted: DDB "expired"
  6. handlePaymentFailed: guard checks dbCustomer.subscriptionStatus === "expired"
     → SKIPS the "past_due" write (V4 Step 3.7 guard)

  Result: Correct in both orderings. Final state is "expired".
```

Terminal: **EXPIRED**

This is why the `handlePaymentFailed` guard (skip `past_due` write if already `expired`) exists.

---

### Scenario 24: `renewLicense` Fails on Happy Path — Next Cycle Corrects

```
April 14: Payment succeeds, renewLicense fails (Scenario 15, steps 1–3)
  → DDB: "active" (correct). KG clock drifting.

May 14: Next billing cycle. Payment succeeds.
  1. invoice.payment_succeeded fires
  2. handlePaymentSucceeded:
     → DDB: "active", expiresAt updated
     → KG: renewLicense → SUCCEEDS this time
     → KG expiresAt reset to +47 days from now (June 30)
  3. KG clock corrected. Drift resolved.
```

Terminal: **ACTIVE**

This is the expected recovery path for Scenario 15. The 17-day buffer exists to cover the gap between the failed `renewLicense` and the next billing cycle's successful one.

---

### Scenario 25: Subscription Created → Extension Heartbeat Before DDB Write Completes

```
  1. User completes Stripe Checkout
  2. checkout.session.completed fires
  3. handleCheckoutCompleted begins: creating CUSTOMER#, LICENSE#, KG license...
     → SIMULTANEOUSLY: User installs extension, enters key, first heartbeat fires
  4. Ext calls POST /api/license/heartbeat
     → getLicenseByKey returns null (DDB write not yet complete)
     → V4: Returns { valid: false, error: "License not found" } with 404
     → Ext shows error
  5. handleCheckoutCompleted completes: DDB records created
  6. Next Ext heartbeat (≤10 min):
     → getLicenseByKey returns LICENSE# → valid: true
```

Terminal: **ACTIVE** (after brief initial error)

Note: The window for this race is small (seconds). The user may see a brief "License not found" error that resolves on the next heartbeat cycle. No retry logic needed — the heartbeat interval handles it.

---

## Terminal State Summary

| Terminal State | Meaning | User Access | How to Exit |
|---|---|---|---|
| **active** | Subscription current, license valid | Full access | — |
| **past_due** | Payment failed, Stripe retrying (≤2 weeks) | Full access (grace period) | Stripe retry succeeds, or user updates card |
| **cancellation_pending** | User requested cancellation | Full access until period end | User reverses cancellation |
| **suspended** | Admin suspended team member | No access | Admin reactivates member |
| **revoked** | Admin revoked team member | No access | Admin reactivates member |
| **expired** | Subscription ended (voluntary, nonpayment, or lost dispute) | No access | User re-subscribes |
| **disputed** | Chargeback in progress | No access | Dispute resolved in our favor |
| **trial** | 14-day trial (extension-local) | Full access | — |
| **TRIAL_EXPIRED** | Trial ended (extension-local) | No access | User purchases license |

---

## Key Differences from V3 Appendix B

1. **No `payment_suspended` state.** Scenarios 7, 8, 17, 19, 20 from V3 all referenced `payment_suspended`. V4 replaces with `active → past_due → expired`.
2. **No `admin_suspended` / `admin_revoked`.** V4 keeps `"suspended"` and `"revoked"` as-is. Unambiguous because `"suspended"` only means admin suspension.
3. **Stripe dunning: 8 retries over 2 weeks** (V3 had 3 retries over ~7 days).
4. **Keygen buffer: 17 days** for monthly (47 - 30), vs V3's 3 days (33 - 30). Dramatically reduces the Scenario 15 risk.
5. **`handlePaymentFailed` guard** (Scenario 23) prevents `past_due` from overwriting `expired`.
6. **Dispute loss → `expired`** (not `payment_suspended` as in V3 Scenario 19).
7. **3 new scenarios** (23, 24, 25) covering out-of-order webhooks on failure path, renewLicense recovery, and checkout race condition.

---

## Open Issues

1. **Scenario 15 — renewLicense failure + buffer expiration:** If `renewLicense` fails for 17+ consecutive days (monthly) or 17+ days (annual), the Keygen `license.expired` webhook overwrites the correct "active" DDB status. The 17-day buffer makes this unlikely but not impossible. The deferred SQS queue would eliminate this risk.

2. **Scenario 25 — Checkout race condition:** Brief "License not found" error during initial provisioning. Resolves on next heartbeat. Acceptable UX tradeoff vs. building retry logic.
