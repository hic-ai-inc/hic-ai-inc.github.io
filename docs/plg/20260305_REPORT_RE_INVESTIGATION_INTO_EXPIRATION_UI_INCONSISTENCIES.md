# Investigation Report: License Expiration UI Inconsistencies

**Date:** March 5, 2026
**Investigator:** Kiro (AI Agent, operating in hic-ai-inc.github.io workspace)
**Severity:** Critical (blocks launch)
**Status:** Root cause identified with high confidence

---

## 1. Problem Statement

The license for `sreiff@hic-ai.com` exhibits contradictory status across multiple surfaces:

| Surface | Status Shown | Source of Truth |
|---|---|---|
| Mouse Status Bar (IDE) | Licensed ✅ | Local state file (`.hic-state.json`) |
| `Mouse: Show Status` command | Inconsistently "EXPIRED" ❌ | Keygen validate-key API (via `_doRefresh`) |
| `license_status` MCP tool | Licensed ✅ | Local state file |
| Portal `/portal` main page | Active ✅ | DynamoDB `CUSTOMER#` → `subscriptionStatus` |
| Portal `/portal/billing` | Active, paid through 3/3/2027 ✅ | DynamoDB + Stripe Customer Portal |
| Portal `/portal/license` | Inconsistently "Expired" ❌ | Keygen `GET /licenses/{id}` API |
| Keygen dashboard | Expired ❌ | Keygen (authoritative for license status) |
| Stripe dashboard | Active, paid through 3/3/2027 ✅ | Stripe (authoritative for payment status) |

The last Keygen webhook event on `https://staging.hic-ai.com/api/webhooks/keygen` was `license.expired`, fired approximately 21 hours before this investigation began.

---

## 2. Root Cause

**The codebase never calls Keygen's `POST /licenses/{id}/actions/renew` endpoint.** This is the single root cause of the entire problem.

### How Keygen License Expiry Works

Per [Keygen's timed license documentation](https://keygen.sh/docs/choosing-a-licensing-model/timed-licenses/):

- A Keygen Policy has a `duration` attribute (measured in seconds)
- When a license is created under that policy, Keygen automatically calculates: `license.expiry = license.created + policy.duration`
- When the expiry date passes, Keygen automatically:
  1. Sets the license status to `EXPIRED`
  2. Fires a `license.expired` webhook event
  3. Returns `valid: false` with code `EXPIRED` on subsequent `validate-key` calls
- A license can be renewed at any time via `POST /licenses/{id}/actions/renew`, which extends: `license.expiry += policy.duration`

### What the Code Does

The Individual and Business Keygen policies have a `duration` configured (set in the Keygen dashboard, policy IDs fetched from SSM at runtime via `getKeygenPolicyIds()`). When a license was created for `sreiff@hic-ai.com`, Keygen set an expiry date based on that duration. That date passed ~21 hours ago.

### What the Code Does NOT Do

A comprehensive search of both repos confirms:

- `actions/renew` — **zero occurrences** in the entire codebase
- `renewLicense` — **zero occurrences** as a function name
- `PATCH` to Keygen licenses to update expiry — **zero occurrences**

The Keygen API calls that DO exist in `plg-website/src/lib/keygen.js`:

| Function | Keygen Endpoint | Present? |
|---|---|---|
| `createLicense` | `POST /licenses` | ✅ |
| `getLicense` | `GET /licenses/{id}` | ✅ |
| `getLicensesByEmail` | `GET /licenses?metadata[email]=...` | ✅ |
| `validateLicense` | `POST /licenses/actions/validate-key` | ✅ |
| `suspendLicense` | `POST /licenses/{id}/actions/suspend` | ✅ |
| `reinstateLicense` | `POST /licenses/{id}/actions/reinstate` | ✅ |
| `revokeLicense` | `POST /licenses/{id}/actions/revoke` | ✅ |
| `checkoutLicense` | `POST /licenses/{id}/actions/check-out` | ✅ |
| `renewLicense` | `POST /licenses/{id}/actions/renew` | ❌ **MISSING** |

### The Disconnect

Stripe controls payment. Keygen controls license status. When Stripe successfully charges a subscription renewal (`invoice.payment_succeeded`), the `handlePaymentSucceeded` handler in `plg-website/src/app/api/webhooks/stripe/route.js`:

1. ✅ Updates DynamoDB license status to `"active"` with new `expiresAt`
2. ✅ Reinstates the Keygen license if it was suspended (calls `reinstateLicense`)
3. ❌ **Does NOT renew the Keygen license expiry** (never calls `renewLicense`)

So DynamoDB thinks the license is active. Stripe thinks the subscription is active. But Keygen's internal expiry clock keeps ticking independently, and when it hits zero, Keygen declares the license expired — regardless of what Stripe or DynamoDB say.

---

## 3. Detailed Trace: Why Each Surface Shows What It Shows

### 3.1 Mouse Status Bar & `license_status` Tool → "Licensed"

**Path:** `license_status()` → `LicenseChecker.getStatus()` → `LicenseStateManager.getStatus()` → reads local `.hic-state.json`

The local state file was last written by the heartbeat response handler. The heartbeat endpoint (`/api/license/heartbeat`) does the following:

1. Pings Keygen machine: `POST /machines/{fingerprint}/actions/ping` — this succeeds because the **machine** is still alive (machine heartbeats and license expiry are independent concepts in Keygen)
2. Looks up license in DynamoDB by key — finds it
3. Returns `{ valid: true, status: "active" }` — because the heartbeat endpoint **never checks the Keygen license status**

The heartbeat response handler in `HeartbeatManager._handleHeartbeatResponse()` sees `status: "active"` and maps it to `LICENSED`. The local state stays `LICENSED`.

**Key finding:** The heartbeat endpoint is a machine-level ping, not a license-level validation. It has no awareness of Keygen license expiry.

### 3.2 `Mouse: Show Status` Command → Inconsistently "EXPIRED"

**Path:** `LicenseChecker._doRefresh()` → `HttpLicenseProvider.validate()` → `POST /api/license/validate` → Keygen `validateLicense(licenseKey, fingerprint)`

When `_doRefresh` runs (background, not on every status check), it calls the validate endpoint which calls Keygen's `validate-key` action. Keygen returns `valid: false` with the license status `EXPIRED`. The `_doRefresh` handler then calls `this.state.expire()`, setting local state to `EXPIRED`.

But on the next heartbeat (every 10 minutes), the heartbeat returns `status: "active"` (because the machine is alive), and the heartbeat handler sets the state back to `LICENSED`.

This creates a race condition:
- After `_doRefresh` runs → state = `EXPIRED`
- After next heartbeat → state = `LICENSED`
- The status bar shows whichever ran last

### 3.3 Portal `/portal` and `/portal/billing` → "Active"

**Path:** Portal main page reads `customer.subscriptionStatus` from DynamoDB CUSTOMER# record.

The Stripe subscription is active and paid. `handlePaymentSucceeded` correctly updates DynamoDB `subscriptionStatus` to `"active"`. The billing page reads from the same source and also links to Stripe Customer Portal, which confirms paid through 3/3/2027.

These surfaces never query Keygen. They are correct about the payment status.

### 3.4 Portal `/portal/license` → Inconsistently "Expired"

**Path:** `GET /api/portal/license` → `buildLicenseResponse()` → calls both `getLicense()` (DynamoDB) and `getKeygenLicense()` (Keygen API)

The `buildLicenseResponse` function in `plg-website/src/app/api/portal/license/route.js` (line ~130):

```javascript
status: keygenLicense?.status || localLicense?.status || "unknown",
```

- When the Keygen API call succeeds: returns `keygenLicense.status` = `"expired"` → portal shows "Expired"
- When the Keygen API call fails/times out: falls back to `localLicense.status` from DynamoDB, which was set to `"expired"` by the `handleLicenseExpired` webhook handler → portal still shows "Expired"
- The "inconsistency" you observed may be from brief moments where the page was cached or the Keygen call returned stale data during the transition

### 3.5 Keygen Webhook → `license.expired`

**Path:** Keygen internal cron → detects `license.expiry < now` → fires `license.expired` webhook → `POST /api/webhooks/keygen`

The webhook handler in `plg-website/src/app/api/webhooks/keygen/route.js` correctly processes this:

```javascript
async function handleLicenseExpired(data, log) {
  const licenseId = data.id;
  await updateLicenseStatus(licenseId, "expired", {
    expiredAt: new Date().toISOString(),
  });
}
```

This updates the DynamoDB LICENSE# record to `status: "expired"`. This is correct behavior — the handler is doing its job. The problem is upstream: the license should never have expired because Stripe payment is current.

---

## 4. DynamoDB State (Queried via AWS CLI — March 5, 2026)

The following data was retrieved directly from the `hic-plg-staging` DynamoDB table using AWS CLI queries during this investigation.

### CUSTOMER# Record (via GSI2: `EMAIL#sreiff@hic-ai.com` / `USER`)
```
PK:                   CUSTOMER#9448c4a8-e081-70fb-4a30-a4ce0f67b8d0
SK:                   DETAILS
subscriptionStatus:   "active"                              ← Stripe webhook (correct)
stripeCustomerId:     "[REDACTED:stripe-customer-id]"       ← Stripe customer ID
keygenLicenseId:      "fab54aac-ea94-4d55-a2be-3e7c1ffe2cbd"
email:                "sreiff@hic-ai.com"
accountType:          "business"
cancelAtPeriodEnd:    false
userId:               "9448c4a8-e081-70fb-4a30-a4ce0f67b8d0"
updatedAt:            "2026-03-03T13:57:53.133Z"
```

### LICENSE# DETAILS Record
```
PK:                   LICENSE#fab54aac-ea94-4d55-a2be-3e7c1ffe2cbd
SK:                   DETAILS
status:               "expired"                             ← Set by Keygen webhook handler
expiredAt:            "2026-03-04T23:40:16.786Z"            ← ~21 hours before investigation
expiresAt:            NULL                                  ← Was set to null at creation (subscription-based)
createdAt:            "2026-02-02T23:34:55.515Z"
eventType:            "LICENSE_CREATED"
planName:             "Business"
policyId:             "b0bcab98-6693-4c44-ad0d-ee3dbb069aea"
activatedDevices:     27
licenseKey:           "[REDACTED:license-key]"
email:                "sreiff@hic-ai.com"
```

33 DEVICE# records are attached to this license.

### License Key Embedded Data (Base64-Decoded)

The license key itself contains a JWT-like structure with embedded policy and license metadata:

```
policy.duration:      2592000                               ← 30 days exactly
license.created:      "2026-02-02T23:34:55.425Z"
license.expiry:       "2026-03-04T23:34:55.435Z"            ← Exactly 30 days after creation
```

This confirms the root cause with certainty: the Keygen policy duration is 30 days, the license was created February 2, and it expired March 4 — exactly 30 days later. No renewal ever occurred.

### The Conflict

| Record | Field | Value | Source |
|---|---|---|---|
| CUSTOMER# | `subscriptionStatus` | `"active"` ✅ | Stripe webhook |
| LICENSE# | `status` | `"expired"` ❌ | Keygen webhook |

Both are technically correct from their respective sources. Stripe says the subscription is paid. Keygen says the license duration elapsed. The missing bridge: nobody called `POST /licenses/{id}/actions/renew` to extend the Keygen expiry when Stripe confirmed payment.

---

## 5. Why This Is NOT a Massive Undertaking

The architecture is sound. Every component is doing exactly what it was designed to do:

- Stripe webhooks correctly update DynamoDB subscription status
- Keygen webhooks correctly update DynamoDB license status
- The portal correctly reads from both DynamoDB and Keygen
- The extension correctly heartbeats and validates
- The heartbeat endpoint correctly pings Keygen machines

The single gap is: **when Stripe confirms payment, nobody tells Keygen to extend the license expiry.** This is one missing API call.

---

## 6. Recommended Fix

### 6.1 Immediate: Manual Keygen Dashboard Fix

Go to the Keygen dashboard and manually renew the license for `sreiff@hic-ai.com`. This will extend the expiry by the policy duration and set the status back to `ACTIVE`. Keygen will fire a `license.renewed` webhook, which the existing `handleLicenseRenewed` handler will process correctly (updating DynamoDB to `status: "active"`).

### 6.2 Code Fix: Add `renewLicense` to `keygen.js`

```javascript
/**
 * Renew a license, extending its expiry by the policy's duration.
 * Called when Stripe confirms a successful subscription payment.
 *
 * @param {string} licenseId - Keygen license UUID
 * @returns {Promise<Object>} - Renewed license data
 */
export async function renewLicense(licenseId) {
  const response = await keygenRequest(
    `/licenses/${licenseId}/actions/renew`,
    { method: "POST" },
  );

  return {
    id: response.data.id,
    status: response.data.attributes.status,
    expiresAt: response.data.attributes.expiry,
  };
}
```

### 6.3 Code Fix: Call `renewLicense` from Stripe Webhook

In `plg-website/src/app/api/webhooks/stripe/route.js`, in `handlePaymentSucceeded`:

```javascript
// After updating DynamoDB license status...
if (dbCustomer.keygenLicenseId && expiresAt) {
  await updateLicenseStatus(dbCustomer.keygenLicenseId, "active", { expiresAt });

  // CRITICAL: Renew the Keygen license expiry to match the new billing period
  try {
    await renewLicense(dbCustomer.keygenLicenseId);
  } catch (e) {
    log.warn("license_renew_failed", "Failed to renew Keygen license", {
      errorMessage: e?.message,
    });
  }
}
```

### 6.4 Architectural Decision: Should the Policy Have a Duration?

See Section 12 for detailed analysis. Summary: Keep the duration, add the `renewLicense` call.

### 6.5 Secondary Fix: Heartbeat Should Check License Status

The heartbeat endpoint currently only pings the Keygen machine. It should also check the license status so the extension learns about expiration promptly. This would prevent the race condition between heartbeat ("active") and validate ("expired").

In `plg-website/src/app/api/license/heartbeat/route.js`, after the machine ping succeeds and the license is found in DynamoDB, add a check:

```javascript
// Check if license is expired/suspended in DynamoDB
if (license.status === "expired" || license.status === "suspended") {
  return NextResponse.json({
    valid: false,
    status: `license_${license.status}`,
    reason: `License is ${license.status}`,
    concurrentMachines: 0,
    maxMachines: 0,
  });
}
```

---

## 7. Files Examined

### Website Repo (`hic-ai-inc.github.io`)

| File | Relevance |
|---|---|
| `plg-website/src/lib/keygen.js` | All Keygen API calls — confirmed `actions/renew` is missing |
| `plg-website/src/lib/dynamodb.js` | `updateLicenseStatus`, `getLicense`, `getLicenseByKey` |
| `plg-website/src/app/api/webhooks/keygen/route.js` | `handleLicenseExpired`, `handleLicenseRenewed` |
| `plg-website/src/app/api/webhooks/stripe/route.js` | `handlePaymentSucceeded`, `handleSubscriptionUpdated` |
| `plg-website/src/app/api/portal/license/route.js` | `buildLicenseResponse` — dual-source status |
| `plg-website/src/app/api/license/heartbeat/route.js` | Machine ping only, no license status check |
| `plg-website/src/app/api/license/validate/route.js` | Calls Keygen `validate-key` (returns expired) |
| `plg-website/src/app/api/provision-license/route.js` | License creation — `expiresAt: null` in DynamoDB |
| `plg-website/src/app/portal/license/page.js` | UI rendering — reads `license.status` from API |
| `plg-website/src/lib/constants.js` | `LICENSE_STATUS_DISPLAY` mapping |
| `plg-website/src/lib/secrets.js` | `getKeygenPolicyIds` — policy IDs from SSM |
| `plg-website/infrastructure/lambda/customer-update/index.js` | DynamoDB Streams handler |

### Extension Repo (`.hic/` in workspace)

| File | Relevance |
|---|---|
| `.hic/licensing/state.js` | `LicenseStateManager` — local state persistence |
| `.hic/licensing/heartbeat.js` | `HeartbeatManager` — 10-min heartbeat cycle |
| `.hic/licensing/http-client.js` | `HttpClient.sendHeartbeat`, `validateLicense` |
| `.hic/licensing/validation.js` | Response schema validation |
| `.hic/licensing/constants.js` | `LICENSE_STATES`, heartbeat config |
| `.hic/licensing/commands/status.js` | `getStatus()` — status bar display |
| `.hic/mouse/src/licensing/license-checker.js` | `_doRefresh`, `_buildStatusResponse`, `LS_STATUS_MAP` |
| `.hic/mouse/src/licensing/constants.js` | `LS_STATUS_MAP` — server status → local status |
| `.hic/mouse/src/licensing/providers/http-provider.js` | `validate()`, `heartbeat()` API calls |
| `.hic/mouse/src/licensing/tool.js` | `license_status` MCP tool implementation |
| `.hic/mouse/src/licensing/messages.js` | Status message generation |

### External Sources

| Source | Finding |
|---|---|
| [Keygen timed license docs](https://keygen.sh/docs/choosing-a-licensing-model/timed-licenses/) | Confirmed: `license.expiry = created + policy.duration`; renew extends by duration |
| [Keygen llms.txt](https://keygen.sh/llms.txt) | Confirmed: License lifecycle actions include suspend, renew, revoke |
| Mouse `license_status` tool | Returns `status: "licensed"` (reads local state) |

---

## 8. Confidence Level

**Confirmed.** The root cause is a missing API call — `actions/renew` appears zero times in the codebase. Every other component is functioning correctly per its design. The fix is surgical: add one function, call it from one place.

The Keygen policy `duration` value has been confirmed from the license key itself (base64-decoded embedded metadata): `policy.duration = 2592000` (30 days exactly). The license was created `2026-02-02T23:34:55.425Z` and expired `2026-03-04T23:34:55.435Z` — exactly 30 days later. DynamoDB state was queried directly via AWS CLI and confirms the conflict: `CUSTOMER#` record shows `subscriptionStatus: "active"` while `LICENSE#` record shows `status: "expired"`. All data points are consistent with the root cause.

---

## 9. Addendum: Keygen Webhook Subscription Gap (Discovered March 5, 2026)

**Finding:** The staging Keygen webhook (`https://staging.hic-ai.com/api/webhooks/keygen`) subscribes to a specific list of events that is missing several events the code handles. A second webhook endpoint (`https://hic-ai.com/api/webhooks/keygen`) subscribes to `*` (all events), but that endpoint does not exist yet and returns 405.

### Staging Webhook Subscription vs. Code Handlers

| Event | Staging Webhook Subscribed? | Code Handler Exists? | Impact |
|---|---|---|---|
| `license.created` | ✅ | ✅ (acknowledged) | None |
| `license.updated` | ✅ | — (no handler) | Low — not currently needed |
| `license.deleted` | ✅ | ✅ (acknowledged) | None |
| `license.validated` | ✅ | — (no handler) | Low — informational |
| `license.expiring-soon` | ✅ | — (no handler) | Medium — could trigger user notification |
| `license.expired` | ✅ | ✅ `handleLicenseExpired` | None |
| `license.renewed` | ❌ | ✅ `handleLicenseRenewed` | **CRITICAL** — DynamoDB never updated on renewal |
| `license.suspended` | ❌ | ✅ `handleLicenseSuspended` | **HIGH** — suspension not reflected in DynamoDB |
| `license.reinstated` | ❌ | ✅ `handleLicenseReinstated` | **HIGH** — reinstatement not reflected in DynamoDB |
| `license.revoked` | ❌ | ✅ `handleLicenseRevoked` | **HIGH** — revocation not reflected in DynamoDB |
| `policy.updated` | ❌ | ✅ (acknowledged) | Low — informational |
| `machine.created` | ✅ | ✅ (acknowledged) | None |
| `machine.deleted` | ✅ | ✅ `handleMachineDeleted` | None |
| `machine.heartbeat.ping` | ✅ | ✅ (acknowledged) | None |
| `machine.heartbeat.dead` | ✅ | ✅ (acknowledged) | None |

### Consequence

When the license was manually renewed in the Keygen dashboard, Keygen fired `license.renewed`. Because the staging webhook does not subscribe to this event, the POST was only sent to the `hic-ai.com` endpoint (which returned 405). The staging endpoint never received it, so `handleLicenseRenewed` never ran, and the DynamoDB LICENSE# record still shows `status: "expired"`.

This is a second root cause, compounding the first (missing `renewLicense` API call). Even if the code called `renewLicense` from `handlePaymentSucceeded`, the resulting `license.renewed` webhook from Keygen would not reach staging to update DynamoDB — though in that case the DynamoDB update would happen directly in `handlePaymentSucceeded` rather than relying on the webhook, so the impact depends on the implementation approach.

### Required Fix

Update the staging Keygen webhook subscription in the Keygen dashboard to add:
- `license.renewed`
- `license.suspended`
- `license.reinstated`
- `license.revoked`
- `policy.updated`

Alternatively, change the staging webhook to subscribe to `*` (all events) to match the production endpoint and prevent future gaps.

### Immediate Action Needed

The manual renewal you just performed was not received by staging. Either:
1. Update the staging webhook subscription to include `license.renewed`, then re-trigger the renewal from the Keygen dashboard, OR
2. Manually update the DynamoDB LICENSE# record to `status: "active"` with the new expiry date

---
## 10. Live Reproduction During Investigation (March 5, 2026)

The following sequence was observed in real time during this investigation, confirming the root causes documented above.

### Timeline

1. **Investigation begins.** Mouse Status Bar shows "Licensed", `license_status` MCP tool returns `status: "licensed"`. Both read from local `.hic-state.json`, which was last set by a heartbeat response (machine alive → "active" → mapped to LICENSED). The Keygen license had already expired ~21 hours prior, but the heartbeat was masking it.

2. **Manual renewal attempted in Keygen dashboard.** SWR manually renewed the license for `sreiff@hic-ai.com` from the Keygen dashboard. Keygen fired `license.renewed`, but the staging webhook (`staging.hic-ai.com`) was not subscribed to this event. The POST was sent only to the `hic-ai.com` endpoint, which returned 405 (no such route exists yet). The staging `handleLicenseRenewed` handler never executed. DynamoDB LICENSE# record remained `status: "expired"`.

3. **Staging webhook updated to `*`.** SWR updated the staging Keygen webhook subscription from a specific event list to `*` (all events), matching the production endpoint configuration.

4. **Developer Window refreshed in IDE.** This triggered a fresh `_doRefresh` → validate call to Keygen. Keygen returned `valid: false`, `status: "EXPIRED"` (the manual renewal from step 2 had failed to propagate). The validate handler called `this.state.expire()`, setting local state to EXPIRED. Mouse Status Bar now showed "EXPIRED". The `license_status` MCP tool confirmed: `status: "expired"`, `blocked: true`. Mouse tools became unavailable.

5. **License key re-entered.** SWR re-entered the license key to reactivate. After refreshing Developer Window, Mouse Status Bar showed "Licensed" and the notification popup confirmed "Mouse: Licensed". The `license_status` MCP tool confirmed: `status: "licensed"`, `blocked: false`. Mouse tools restored.

### Observations

- The heartbeat masking effect (Section 3.1 and 3.2) was confirmed live: Mouse showed "Licensed" for ~21 hours after the Keygen license had actually expired.
- The webhook subscription gap (Section 9) was confirmed live: the manual renewal webhook was not delivered to staging.
- The validate/heartbeat race condition (Section 3.2) was confirmed: once a fresh validate ran without a competing heartbeat, the expired state stuck.
- Re-entering the license key resolved the local state, confirming the extension's activation flow works correctly independent of the server-side expiry issue.

---



## 11. Suggested Next Steps

1. ~~**Fix staging webhook subscription:**~~ ✅ DONE (March 5, 2026) — Staging Keygen webhook switched from specific event list to `*` (all events), matching production.
2. ~~**Re-trigger manual renewal:**~~ ✅ DONE (March 5, 2026) — License renewed from Keygen dashboard after webhook subscription fix. Staging received the `license.renewed` event.
3. **Implement the code fix:** See Section 12 for detailed analysis and recommendation.
4. **Add heartbeat license status check:** Prevent the heartbeat/validate race condition.
5. **Test the full cycle:** Simulate a payment success and verify the license expiry extends in Keygen AND the webhook reaches staging.
6. **Consider a second opinion** on the Keygen policy configuration strategy before launch.

---

## 12. Detailed Fix Analysis: How to Prevent Recurrence

### The Core Problem Restated

Stripe controls payment. Keygen controls license validity. These two systems have no automatic synchronization. When Stripe confirms a subscription payment, the code updates DynamoDB but never tells Keygen to extend the license expiry. Keygen's internal 30-day clock ticks independently and eventually expires the license.

### Option A: Keep Duration + Renew on Payment (Recommended)

Add a `renewLicense` function to `keygen.js` and call it from `handlePaymentSucceeded` in the Stripe webhook handler.

**What changes:**

1. `plg-website/src/lib/keygen.js` — Add `renewLicense(licenseId)` that calls `POST /licenses/{licenseId}/actions/renew`
2. `plg-website/src/app/api/webhooks/stripe/route.js` — In `handlePaymentSucceeded`, after the existing `updateLicenseStatus` call, add `await renewLicense(dbCustomer.keygenLicenseId)`

**Current `handlePaymentSucceeded` flow:**
```
invoice.payment_succeeded →
  1. resolveCustomer(stripeCustomerId) → dbCustomer
  2. updateLicenseStatus(licenseId, "active", { expiresAt })     ← DynamoDB only
  3. if past_due/suspended → reinstateLicense(licenseId)          ← Keygen API
```

**Proposed flow:**
```
invoice.payment_succeeded →
  1. resolveCustomer(stripeCustomerId) → dbCustomer
  2. updateLicenseStatus(licenseId, "active", { expiresAt })     ← DynamoDB
  3. renewLicense(licenseId)                                      ← Keygen API (NEW)
  4. if past_due/suspended → reinstateLicense(licenseId)          ← Keygen API
```

**Why this works:**

- `renewLicense` calls `POST /licenses/{id}/actions/renew`, which tells Keygen to set `license.expiry += policy.duration` (30 more days from now)
- Keygen fires `license.renewed` webhook → staging receives it (now that webhook subscribes to `*`) → `handleLicenseRenewed` updates DynamoDB with new expiry
- The DynamoDB update in step 2 is belt-and-suspenders: it sets DynamoDB to "active" immediately, even before the Keygen webhook arrives
- If the `renewLicense` call fails, the DynamoDB update still happened, and we log a warning. The license will eventually expire again in 30 days, but we'll have logs showing the failure

**Why this is the right approach:**

- Defense in depth: Keygen's expiry clock acts as a safety net. If Stripe fails to charge, AND the `invoice.payment_failed` webhook fails, AND the `customer.subscription.updated` webhook fails — the license still auto-expires. The customer isn't charged, and they don't get free service.
- Matches Keygen's design intent: Keygen built the `actions/renew` endpoint specifically for this use case. Timed licenses with renewal on payment is their documented pattern.
- Minimal code change: One new function (~15 lines), one new call site (~5 lines). No architectural changes.
- The `handleLicenseRenewed` webhook handler already exists and works correctly — it updates DynamoDB to `status: "active"` with the new expiry.

**Duration alignment question:**

The current policy duration is 30 days. Billing periods are monthly (30 days) or annual (365 days). For monthly subscribers, 30 days aligns naturally. For annual subscribers, the license would need to be renewed every 30 days even though they're paid for a year. Two sub-options:

- **A1: Keep 30-day duration for all plans.** Renew on every `invoice.payment_succeeded`. Annual subscribers get renewed once a year (when Stripe charges), so the license would expire 30 days after creation unless we also renew on subscription creation. This is problematic — annual licenses would expire after 30 days.
- **A2: Set duration per policy to match billing period.** Individual/Business Monthly policies get 30-day duration. Individual/Business Annual policies get 365-day duration. This requires separate Keygen policies per billing cadence (which may already exist — the code fetches `getKeygenPolicyIds()` from SSM, suggesting multiple policies). Renew on `invoice.payment_succeeded` naturally aligns: monthly subscribers get renewed monthly, annual subscribers get renewed annually.
- **A3: Set duration to a generous buffer (e.g., 45 days for monthly, 400 days for annual).** Gives breathing room for Stripe retry cycles (Stripe retries failed payments for up to ~3 weeks by default). The license doesn't expire during the retry window, only after Stripe has given up.

**Recommendation: A3 (generous buffer).** A 45-day duration for monthly and 400-day duration for annual gives Stripe's retry cycle room to work without the license expiring prematurely. If Stripe ultimately fails to collect after its retry cycle, the license expires naturally. This is the most forgiving to customers and the least likely to cause false-positive expirations.

### Why Option B (Remove Duration) Is Not Viable

Option B would set `policy.duration = null` (no expiry) and control the license lifecycle entirely through `suspendLicense` / `reinstateLicense` / `revokeLicense` triggered by Stripe webhooks.

**This is not a plausible option for several reasons:**

1. **Single point of failure.** If the Stripe webhook for `invoice.payment_failed` doesn't fire (network issue, Amplify cold start timeout, deployment gap, Stripe outage), the license stays active forever. There is no safety net. The customer stops paying but keeps using the product indefinitely. With duration-based expiry, the license self-heals by expiring on its own.

2. **Stripe retry complexity.** Stripe retries failed payments over a configurable period (default ~3 weeks). During this window, the subscription status is `past_due`, not `canceled`. You'd need to decide: do you suspend the license on the first failed payment (punishing the customer during Stripe's retry window), or wait until Stripe gives up (leaving the license active for weeks after the last successful payment)? Duration-based expiry handles this naturally — the license expires when the clock runs out, regardless of Stripe's retry state.

3. **No protection against webhook ordering issues.** If `invoice.payment_failed` and `invoice.payment_succeeded` arrive out of order (rare but possible with webhook retries), you could suspend a license that was just successfully paid. Duration-based expiry is immune to ordering — it only cares about the clock.

4. **Audit trail gap.** With duration, Keygen's `license.expiring-soon` and `license.expired` events provide a clear audit trail of when licenses approach and cross their expiry boundary. Without duration, the only events are your own suspend/reinstate calls — you lose Keygen's independent verification.

5. **Contradicts the existing architecture.** The policies already have duration set (confirmed: 2592000 seconds). The `handleLicenseExpired`, `handleLicenseRenewed`, and `license.expiring-soon` subscription all assume duration-based lifecycle. Removing duration would require rethinking the entire webhook handler set and the extension's validate/heartbeat behavior.

6. **Consistency.** All paid license policies use duration-based expiry. Having some policies with duration and some without creates inconsistency in the licensing model and complicates the extension's status logic. (Note: trials are purely local to the extension and have no Keygen policy.)

### Implementation Plan

Assuming Option A3 (keep duration with generous buffer):

**Step 1: Add `renewLicense` to `keygen.js`**
```javascript
export async function renewLicense(licenseId) {
  const response = await keygenRequest(
    `/licenses/${licenseId}/actions/renew`,
    { method: "POST" },
  );
  return {
    id: response.data.id,
    status: response.data.attributes.status,
    expiresAt: response.data.attributes.expiry,
  };
}
```

**Step 2: Call from `handlePaymentSucceeded`**
```javascript
// After updateLicenseStatus call:
if (dbCustomer.keygenLicenseId) {
  try {
    const renewed = await renewLicense(dbCustomer.keygenLicenseId);
    log.info("license_renewed", "Keygen license renewed on payment success", {
      licenseId: dbCustomer.keygenLicenseId,
      newExpiry: renewed.expiresAt,
    });
  } catch (e) {
    log.warn("license_renew_failed", "Failed to renew Keygen license on payment success", {
      licenseId: dbCustomer.keygenLicenseId,
      errorMessage: e?.message,
    });
  }
}
```

**Step 3: Update Keygen policy durations in dashboard**
- Monthly policies: 45 days (3,888,000 seconds)
- Annual policies: 400 days (34,560,000 seconds)
- Note: Trials are purely local to the extension (14-day clock). No Keygen policy exists for trials.

**Step 4: Fix heartbeat race condition**
Add license status check to heartbeat endpoint so the extension learns about expiration promptly (see Section 6.5).

**Step 5: Test**
- Trigger a test `invoice.payment_succeeded` webhook via Stripe CLI
- Verify `renewLicense` is called and Keygen expiry extends
- Verify `license.renewed` webhook reaches staging
- Verify DynamoDB LICENSE# record updates to `status: "active"` with new expiry
- Verify extension shows "Licensed" consistently across all surfaces


---

## 13. Addendum: Architectural Review (March 5, 2026)

**Reviewer:** GitHub Copilot (Claude Opus 4.6), acting as Chief Reviewer at SWR's request
**Scope:** Independent verification of Kiro's root cause analysis; architectural assessment of the licensing subsystem; evaluation of proposed fixes

---

### 13.1 Independent Verification

Every factual claim in Sections 1–12 was independently verified against source code:

| Claim | Verified? | Method |
|---|---|---|
| `actions/renew` absent from JS codebase | ✅ | `grep_search` across all `*.js` — zero matches |
| `renewLicense` function absent | ✅ | `grep_search` — zero matches in JS files |
| Portal status uses `keygenLicense?.status \|\| localLicense?.status` | ✅ | `portal/license/route.js` line 145 |
| Heartbeat only pings Keygen machine, no license check | ✅ | `heartbeat/route.js` — calls `machineHeartbeat()` only |
| Validate endpoint calls Keygen at request time | ✅ | `validate/route.js` line 217 — `validateLicense(licenseKey, fingerprint)` |
| `handleLicenseRenewed` handler exists but never fires | ✅ | Handler present in `webhooks/keygen/route.js`; no caller |
| DynamoDB LICENSE# shows `status: "expired"` | ✅ | Reported from AWS CLI query |

**Kiro's root cause identification is correct.** The missing `renewLicense` call is the proximate cause of the incident.

---

### 13.2 The Deeper Problem: Keygen as Runtime Dependency

The missing `renewLicense` call is the proximate cause, but it is a symptom of a fundamentally fragile architecture: **Keygen is being treated as a runtime read dependency instead of a write-only sync target.**

The correct pattern: Keygen and Stripe are vendors. They push events to us via webhooks. We write those events to DynamoDB. From that point forward, **every request-time decision reads from DynamoDB only.** We never call Keygen at request time to ask "is this license valid?" — we already know, because Keygen told us (via webhook), and we wrote it down.

What we have instead: **six API routes make live Keygen calls at request time**, with some falling back to DynamoDB and others failing hard:

| Route | Live Keygen Call | Fallback on Failure? |
|---|---|---|
| `/api/license/validate` | `validateLicense()` | **None — hard fail** |
| `/api/license/heartbeat` | `machineHeartbeat()` | **None — hard fail** |
| `/api/license/activate` | `validateLicense()` + `activateDevice()` | **None — hard fail** |
| `/api/license/check` | `getLicensesByEmail()` | DynamoDB fallback |
| `/api/portal/license` | `getKeygenLicense()` | DynamoDB fallback |
| `/api/provision-license` | `createLicenseForPlan()` | **None — hard fail** |

The three "hard fail" routes mean: **if Keygen has a 30-second outage, paying customers lose access to Mouse.** There is no circuit breaker, no cached validation, no graceful degradation.

#### The Dual-Source-of-Truth Anti-Pattern

This line in `portal/license/route.js` (line 145) encapsulates the problem:

```javascript
status: keygenLicense?.status || localLicense?.status || "unknown"
```

This says: "I don't trust my own database, so I'll ask Keygen first and only fall back to DynamoDB if Keygen is unreachable." The result: users get two different answers depending on whether a third-party API responded — with no way to know which one they're seeing.

The same pattern in `license/check/route.js` (lines 89–144): try DynamoDB first, then fall back to querying Keygen by email. This creates an inconsistency where the same user can get different results depending on network conditions.

#### What Should Be a Runtime Dependency vs. a Sync Target

| Operation | Should call Keygen at request time? | Reason |
|---|---|---|
| **Create** license | ✅ Yes | Mutation — must exist in Keygen to be real |
| **Activate** device | ✅ Yes | Mutation — must register with Keygen |
| **Deactivate** device | ✅ Yes | Mutation — must deregister with Keygen |
| **Validate** license | ❌ No — read from DynamoDB | Read — DynamoDB has the status from webhooks |
| **Heartbeat** (machine ping) | ⚠️ Maybe | Keygen tracks machine liveness independently; could be async |
| **Check** license existence | ❌ No — read from DynamoDB | Read — we created the license; we know it exists |
| **Portal** license display | ❌ No — read from DynamoDB | Read — display what we know, not what a vendor says right now |

---

### 13.3 Missing Resilience Infrastructure

#### 13.3.1 No DLQs for Keygen Mutation Calls

The async infrastructure (email, customer-update) has proper SQS queues with DLQs:

- `plg-email-queue` → 3 retries → `plg-email-dlq` (14-day retention)
- `plg-customer-update-queue` → 3 retries → `plg-customer-update-dlq` (14-day retention)

But **webhook handlers that call Keygen APIs have zero retry infrastructure.** When `handlePaymentSucceeded` calls `reinstateLicense()` (and would call `renewLicense()` under the proposed fix), those calls are fire-and-forget within the webhook handler. If the Keygen API is slow, throttled, or down at that moment, the call fails, a warning is logged, and the state diverges silently.

The correct pattern:

```
Stripe webhook → update DynamoDB (immediate, synchronous)
              → enqueue Keygen sync message (SQS, async)
                  → Keygen sync worker (Lambda)
                      → retry up to 3x
                      → DLQ on exhaustion
```

DynamoDB is updated immediately (the customer's status is correct in our system within milliseconds). The Keygen sync happens asynchronously with retries. If Keygen is down for an hour, the messages queue up and process when it recovers. If retries exhaust, the DLQ collects them for operational review.

#### 13.3.2 No Reconciliation Job

Even with perfect webhooks and retries, external systems drift. The existing scheduled-tasks Lambda runs two tasks:

- `pending-email-retry` — retries emails for newly verified SES addresses
- `mouse-version-notify` — gates version notification timing

**There is no reconciliation task.** There should be a `license-reconciliation` task that runs periodically (hourly or daily) and:

1. Queries DynamoDB for licenses with `status: "active"` approaching expiry (within 48 hours)
2. Calls Keygen to verify the license state matches
3. Corrects any drift (renews Keygen if DynamoDB says active but Keygen says expired; expires DynamoDB if Keygen says expired and Stripe confirms no active subscription)
4. Alerts on unresolvable conflicts

This is the safety net — not a 45-day buffer on the policy duration.

#### 13.3.3 No Circuit Breaker on External Calls

Every Keygen call in the request path is a bare `fetch` wrapped in error handling that either throws or returns null. There is no:

- Circuit breaker (stop calling a failing service after N failures)
- Request timeout enforcement (Keygen could hang for 30 seconds)
- Cached response fallback (serve last-known-good while Keygen is down)

For the read paths, eliminating the Keygen call entirely (reading from DynamoDB) solves this. For the mutation paths (create, activate, deactivate), a circuit breaker with graceful degradation should be considered.

---

### 13.4 The Buffer Duration Is Wrong

The report recommends Option A3: 45-day duration for monthly plans, 400-day for annual. The reasoning: give Stripe's retry cycle room to work.

**This is the wrong approach.** A 45-day duration on a 30-day subscription means a customer who cancels and stops paying retains full access for 15 extra days. That is not a buffer — that is giving away the product.

The correct analysis:

| Factor | Duration |
|---|---|
| Billing period (monthly) | 30 days |
| Stripe Smart Retries window | ~21 days (configurable) |
| Webhook delivery + processing margin | 1–2 days |
| **Correct buffer** | **Billing period + 2–3 days** |

For monthly: **33 days** (2,851,200 seconds). For annual: **368 days** (31,795,200 seconds). (Trials are purely local to the extension and have no Keygen policy.)

The extra 2–3 days covers: webhook delivery delays, cold start timeouts, deployment gaps, and the reconciliation job's execution interval. If the system needs more than 3 days of buffer, the reconciliation job is not working.

The Stripe retry cycle is irrelevant to the Keygen duration because:
- During Stripe retries, the subscription status is `past_due`, not `canceled`
- `handlePaymentSucceeded` fires on each successful retry, which should trigger `renewLicense`
- If all retries fail, Stripe fires `customer.subscription.deleted` and we should `suspendLicense` or `revokeLicense`
- The Keygen duration is the **absolute backstop** — it only matters if every webhook and every retry and the reconciliation job all fail simultaneously

---

### 13.5 Additional Findings

#### 13.5.1 Reinstate-Before-Renew Ordering

The report's proposed flow in Section 12 places `renewLicense` before the conditional `reinstateLicense`:

```
3. renewLicense(licenseId)                    ← Keygen API (NEW)
4. if past_due/suspended → reinstateLicense(licenseId)
```

This ordering may be incorrect. If a Keygen license is in `SUSPENDED` state, calling `actions/renew` on it may fail or produce unexpected behavior depending on Keygen's state machine. **Reinstatement should precede renewal:** reinstate first (if the license is suspended), then renew the expiry.

#### 13.5.2 Production Webhook Endpoint Does Not Exist

Section 9 of the report notes that `https://hic-ai.com/api/webhooks/keygen` (the production Keygen webhook endpoint) returns 405. This should be a **launch blocker**: production Keygen webhooks have nowhere to deliver. This must be resolved before launch.

---

### 13.6 Corrected Architecture Target

```
Extension → Your API → DynamoDB (reads only)
Keygen  → Webhooks → Your API → DynamoDB (writes)
Stripe  → Webhooks → Your API → DynamoDB (writes) → SQS → Keygen sync (mutations)
Reconciliation Lambda (scheduled) → DynamoDB ↔ Keygen (drift detection + correction)
```

**Reads:** DynamoDB only. Always. Every endpoint.
**Writes from vendors:** Webhook → DynamoDB. Immediate.
**Our writes to vendors:** SQS queue → retry → DLQ. Async.
**Safety net:** Scheduled reconciliation. Not duration buffers.

---

### 13.7 Summary of Recommendations

| # | Recommendation | Priority | Scope |
|---|---|---|---|
| 1 | Add `renewLicense` function and call from `handlePaymentSucceeded` | **P0 — Immediate** | ~20 lines |
| 2 | Fix call ordering: reinstate before renew | **P0 — Immediate** | ~5 lines |
| 3 | Set policy durations to billing period + 3 days (33d / 368d) | **P0 — Immediate** | Keygen dashboard |
| 4 | Remove Keygen read calls from validate, check, portal endpoints | **P1 — Pre-launch** | Refactor 3 routes |
| 5 | Add SQS queue + DLQ for Keygen mutation sync | **P1 — Pre-launch** | New queue + worker |
| 6 | Add `license-reconciliation` scheduled task | **P1 — Pre-launch** | New task in scheduled-tasks |
| 7 | Resolve `suspended` naming ambiguity (payment vs. admin) | **P1 — Pre-launch** | Codebase-wide refactor |
| 8 | Ensure production Keygen webhook endpoint exists | **P0 — Launch blocker** | Deployment |
| 9 | Add heartbeat license status check (DynamoDB) | **P1 — Pre-launch** | ~15 lines |
| 10 | Add integration test for Stripe → Keygen → DynamoDB cycle | **P1 — Pre-launch** | New test |
| 11 | Add circuit breaker for Keygen mutation calls | **P1 — Pre-launch** | New utility |
| 12 | Add CloudWatch alarms for DLQ, failures, drift | **P1 — Pre-launch** | Infrastructure |
| 13 | Document Keygen policy duration rationale | **P1 — Pre-launch** | Operational docs |

See standalone memo `20260305_KEYGEN_WEBHOOK_REMEDIATION_PLAN.md` for full implementation details.

