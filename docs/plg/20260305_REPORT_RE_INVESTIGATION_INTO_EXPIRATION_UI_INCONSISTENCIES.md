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

This is the deeper question that warrants a second opinion. Two valid approaches:

**Option A: Keep duration, renew on payment (recommended)**
- Policy duration = billing period (e.g., 31,556,952 seconds for annual)
- Call `renewLicense` on every `invoice.payment_succeeded`
- Keygen expiry acts as a safety net: if Stripe fails to charge AND the webhook fails, the license auto-expires
- Pro: Defense in depth. Con: Requires the renew call to be reliable.

**Option B: Remove duration, control lifecycle entirely via suspend/reinstate**
- Set policy duration to `null` (no expiry)
- On payment failure → `suspendLicense`
- On payment success after failure → `reinstateLicense`
- On subscription deleted → `revokeLicense`
- Pro: Simpler, no expiry clock to manage. Con: If Stripe webhook fails, license stays active forever.

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

1. **Fix staging webhook subscription:** Add `license.renewed`, `license.suspended`, `license.reinstated`, `license.revoked`, and `policy.updated` to the staging Keygen webhook — or switch to `*` to match production.
2. **Re-trigger manual renewal:** After fixing the webhook subscription, renew the license again from the Keygen dashboard so staging receives the `license.renewed` event and DynamoDB is updated.
3. **Decide on approach:** Option A (keep duration + renew) vs Option B (remove duration + suspend/reinstate only).
4. **Implement the code fix:** Add `renewLicense` function and wire it into `handlePaymentSucceeded`.
5. **Add heartbeat license status check:** Prevent the heartbeat/validate race condition.
6. **Test the full cycle:** Simulate a payment success and verify the license expiry extends in Keygen AND the webhook reaches staging.
7. **Consider a second opinion** on the Keygen policy configuration strategy before launch.
