# Heartbeat Request/Response Schema Analysis

**Date:** 2026-03-09
**Author:** AI Coding Assistant (GitHub Copilot, Claude Opus 4.6), with design direction from SWR
**Status:** ANALYSIS + PROPOSED FIX
**Repos:** `SimonReiff/hic` (extension), `plg-website` (server)
**Branch:** `development`
**Context:** Phase 2 of the Status Remediation Plan; supplements the [Phase 2 Implementation Plan](20260308_STATUS_REMEDIATION_PROPOSED_PHASE_2_IMPLEMENTATION_PLAN.md)

---

## Purpose

This memo documents the complete heartbeat mechanism as it exists today, identifies a root-cause failure in the heartbeat lifecycle for licensed users, and proposes a minimal server-side fix that requires zero changes to the extension request schema.

---

## 1. Request Schema

The extension sends a POST to `https://hic-ai.com/api/license/heartbeat`. The HTTP call is built in `licensing/http-client.js` → `sendHeartbeat()`:

```json
POST /api/license/heartbeat
{
  "fingerprint":  "a1b2c3d4...",
  "machineId":    "mach_...",
  "sessionId":    "uuid-v4",
  "licenseKey":   "MOUSE-XXXX-..." | null
}
```

### 1.1 Field Definitions

| Field         | Type             | Required?      | Source                                                                                                      | Lifecycle                                                                                         |
| ------------- | ---------------- | -------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `fingerprint` | `string`         | **Compulsory** | `licensing/fingerprint.js` — SHA-256 of hostname + platform + arch + CPU model + total memory. 32-char hex. | Stable across reboots. Changes only on hardware swap.                                             |
| `machineId`   | `string`         | **Compulsory** | Assigned by Keygen during device activation. Stored in `~/.hic/license.json`.                               | Persists until license deactivation or Keygen machine deletion (DEACTIVATE_DEAD).                 |
| `sessionId`   | `string`         | **Compulsory** | Fresh UUIDv4 generated each VS Code session. Stored in state.                                               | One per VS Code window lifecycle.                                                                 |
| `licenseKey`  | `string \| null` | **Optional**   | Entered by user via `Ctrl+Shift+P → Mouse: Enter License Key`, which opens a browser-based auth code flow.  | `null` for trial users. Present for licensed users — but **only when available** (see Section 5). |

### 1.2 Fingerprint Generation

`licensing/fingerprint.js` exports `generateFingerprint()`:

```
SHA-256( hostname + platform + arch + cpuModel + totalMemory ) → 32-char hex
```

Also exports:

- `getDeviceName()` → `"username's hostname"` format
- `getPlatform()` → `os.platform()` (darwin/win32/linux)
- `generateMachineId()` → fallback `mach_${hash}_${uuidPrefix}`

### 1.3 Heartbeat Timing

Configured in `licensing/constants.js`:

| Constant                    | Value            | Notes                             |
| --------------------------- | ---------------- | --------------------------------- |
| `HEARTBEAT.INTERVAL_MS`     | 600,000 (10 min) | Matches Keygen's heartbeat policy |
| `HEARTBEAT.RETRY_COUNT`     | 3                | Per heartbeat attempt             |
| `HEARTBEAT.BACKOFF_BASE_MS` | 1,000            | Exponential: 1s, 2s, 4s           |

The VSIX `HeartbeatManager` (`mouse-vscode/src/licensing/heartbeat.js`) fires an immediate heartbeat on `start()`, then every 10 minutes via `setInterval`. It only starts for **licensed** users — trial users do not heartbeat (guard at line 80: `if (!state.licenseKey) { return false; }`).

---

## 2. Server-Side Processing (Order of Operations)

The server handler lives in the website repo: `plg-website/src/app/api/license/heartbeat/route.js` (~382 lines). It is a Next.js API route.

### 2.1 Roles

| Actor        | Role                                                                                                                                                                                                                  |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **End-user** | Not involved at heartbeat time. Provides license key once during activation (browser auth flow). Heartbeats fire automatically thereafter.                                                                            |
| **DynamoDB** | **Sole source of truth for reads** (Phase 1 Fix 7). Stores license status, device records, version config. Written to by Stripe webhooks, Keygen webhooks, and the heartbeat handler's fire-and-forget device update. |
| **Keygen**   | Used for **writes only** (create/deactivate machine, license operations). The one remaining read is the machine heartbeat ping, which keeps Keygen's heartbeat monitor alive.                                         |

### 2.2 Server Processing Steps

1. **Keygen machine heartbeat ping** — POST to Keygen's machine heartbeat endpoint.
   - 200 OK → machine is alive in Keygen's view, continue
   - 404 → machine deactivated → respond `{ valid: false, status: "machine_not_found" }`
   - 429/5xx → server error → respond `{ valid: false, status: "error" }`

2. **DynamoDB license lookup** — Read `LICENSE#{licenseKey}/DETAILS` record.
   - Checks license existence and current status (`active`, `past_due`, `expired`, etc.)

3. **DynamoDB active device count** — Query `LICENSE#{licenseId}/DEVICE#*` records.
   - Filters by `lastSeenAt > (now - 2 hours)` (sliding window)
   - Counts concurrent active devices vs. `maxMachines` limit

4. **DynamoDB version config** — Read `VERSION#mouse/CURRENT` record.
   - Extracts `latestVersion`, `readyVersion`, `readyReleaseNotesUrl`, `readyUpdateUrl`, `readyUpdatedAt`
   - EventBridge Lambda promotes `latestVersion` → `readyVersion` daily at 9AM UTC

5. **Fire-and-forget device update** — Non-blocking DDB update to `LICENSE#{keygenLicenseId}/DEVICE#{fingerprint}`, setting `lastSeenAt = now`. This is the mechanism behind the 2-hour sliding window for concurrent enforcement.

---

## 3. Response Schema

Validated by `validateHeartbeatResponse()` in `licensing/validation.js`:

### 3.1 Fields

| Field                  | Type      | Always present? | Constraints                           | Notes                                            |
| ---------------------- | --------- | --------------- | ------------------------------------- | ------------------------------------------------ |
| `valid`                | `boolean` | **Yes**         | —                                     | `true` = tools work, `false` = something's wrong |
| `status`               | `string`  | Effectively yes | Must be in `VALID_HEARTBEAT_STATUSES` | Defaults to `"active"` if absent                 |
| `reason`               | `string`  | No              | Max 500 chars                         | Human-readable explanation                       |
| `concurrentMachines`   | `integer` | No              | 0–100                                 | Current active device count                      |
| `maxMachines`          | `integer` | No              | 1–100                                 | License device limit                             |
| `suspended`            | `boolean` | No              | —                                     | Legacy flag (pre-Phase 1)                        |
| `expired`              | `boolean` | No              | —                                     | Legacy flag (pre-Phase 1)                        |
| `latestVersion`        | `string`  | No              | Semver `X.Y.Z`                        | Latest published version                         |
| `downloadUrl`          | `string`  | No              | Must be HTTPS                         | Direct download URL                              |
| `releaseNotesUrl`      | `string`  | No              | Must be HTTPS                         | Release notes link                               |
| `updateUrl`            | `string`  | No              | Must be HTTPS                         | Marketplace update link                          |
| `readyVersion`         | `string`  | No              | Semver `X.Y.Z`                        | Daily-gated version for notifications            |
| `readyReleaseNotesUrl` | `string`  | No              | Must be HTTPS                         | Ready version release notes                      |
| `readyUpdateUrl`       | `string`  | No              | Must be HTTPS                         | Ready version update link                        |
| `readyUpdatedAt`       | `string`  | No              | —                                     | ISO timestamp of readyVersion promotion          |

### 3.2 Example Responses by Status

**Active licensed user:**

```json
{
  "valid": true,
  "status": "active",
  "reason": "Heartbeat successful",
  "latestVersion": "0.10.10",
  "readyVersion": "0.10.10",
  "readyReleaseNotesUrl": "https://...",
  "readyUpdateUrl": "https://...",
  "readyUpdatedAt": "2026-02-19T09:00:44.448Z"
}
```

**Trial user:**

```json
{
  "valid": true,
  "status": "trial",
  "latestVersion": "0.10.10",
  "readyVersion": "0.10.10",
  "readyReleaseNotesUrl": "https://...",
  "readyUpdateUrl": "https://...",
  "readyUpdatedAt": "2026-02-19T09:00:44.448Z"
}
```

**Over-limit (soft warning — tools still work):**

```json
{
  "valid": true,
  "status": "over_limit",
  "reason": "You're using 4 of 3 allowed devices",
  "concurrentMachines": 4,
  "maxMachines": 3,
  "message": "..."
}
```

**Machine not found (Keygen deleted it):**

```json
{
  "valid": false,
  "status": "machine_not_found",
  "reason": "Machine not found for this license"
}
```

**Member suspended by team Owner:**

```json
{
  "valid": false,
  "status": "suspended",
  "reason": "Member access suspended by team administrator"
}
```

**Expired subscription:**

```json
{
  "valid": false,
  "status": "expired",
  "reason": "Subscription expired"
}
```

---

## 4. Status Evolution — Pre-Phase 1 vs. Post-Phase 1

### 4.1 Pre-Phase 1 Server Statuses

| Status              | `valid` | Notes                                           |
| ------------------- | ------- | ----------------------------------------------- |
| `active`            | `true`  | License valid                                   |
| `trial`             | `true`  | Trial valid                                     |
| `license_expired`   | `false` | Subscription ended                              |
| `license_suspended` | `false` | Conflated payment failure with admin suspension |
| `license_revoked`   | `false` | License terminated                              |
| `over_limit`        | `true`  | Too many devices (soft warning)                 |
| `machine_not_found` | `false` | Keygen machine deactivated                      |
| `error`             | `false` | Server error                                    |

### 4.2 Post-Phase 1 Server Statuses (Current)

| Status                 | `valid` | Change from Pre-Phase 1                                |
| ---------------------- | ------- | ------------------------------------------------------ |
| `active`               | `true`  | Unchanged                                              |
| `trial`                | `true`  | Unchanged                                              |
| `past_due`             | `true`  | **New** — Stripe dunning window, tools work            |
| `cancellation_pending` | `true`  | **New** — Subscription ending at period end            |
| `expired`              | `false` | Renamed from `license_expired`                         |
| `suspended`            | `false` | **Redefined** — member suspended by Owner, not payment |
| `revoked`              | `false` | **Redefined** — member revoked by Owner (permanent)    |
| `over_limit`           | `true`  | Unchanged                                              |
| `machine_not_found`    | `false` | Unchanged                                              |
| `error`                | `false` | Unchanged                                              |

### 4.3 What Phase 1 Changed on the Server

Nine fixes landed at commit `e2f5147`, verified by 1910 PLG tests + 808 DM tests. The changes relevant to heartbeat:

| Fix   | Impact on Heartbeat                                                 |
| ----- | ------------------------------------------------------------------- |
| Fix 2 | Null-safety for license/status in heartbeat handler                 |
| Fix 3 | All status strings normalized to lowercase                          |
| Fix 5 | `suspended` no longer means payment failure — only admin suspension |
| Fix 7 | DDB is sole source of truth for reads; Keygen for writes only       |

---

## 5. The Root-Cause Heartbeat Failure for Licensed Users

### 5.1 The Problem

After a user successfully completes the `Mouse: Enter License Key` activation flow, the following works correctly:

1. User runs `Ctrl+Shift+P → Mouse: Enter License Key`
2. Browser opens, user authenticates via auth code flow
3. Backend binds user + device + license in DDB
4. Extension shows "Mouse: Licensed" in status bar
5. `license.validation.succeeded` fires in Keygen — 200 OK
6. `machine.heartbeat.ping` fires in Keygen — 200 OK

**Then heartbeat goes silent.** The Keygen dashboard shows no further heartbeat pings, and eventually a `machine.heartbeat.dead` event fires (Keygen's heartbeat monitor declaring the machine dead).

### 5.2 Root Cause: License Key Not Persisted

The heartbeat requires four arguments. The fourth — `licenseKey` — is **optional** in the schema but **functionally required** by the current server logic to look up the license:

```js
// licensing/http-client.js L185
async sendHeartbeat(fingerprint, machineId, sessionId, licenseKey) {
```

The license key is available during the activation flow (the user just entered it), but **is not reliably persisted to local state** after the browser auth flow completes. When the heartbeat fires 10 minutes later, `state.licenseKey` is `null`, producing:

```json
POST /api/license/heartbeat
{
  "fingerprint": "a1b2c3d4...",
  "machineId": "mach_...",
  "sessionId": "uuid-v4",
  "licenseKey": null
}
```

The server currently **requires** the license key to perform the DDB lookup at step 2 (`LICENSE#{licenseKey}/DETAILS`). With `licenseKey: null`, the lookup fails, and no Keygen heartbeat ping is relayed — hence `machine.heartbeat.dead`.

### 5.3 Why This Matters

1. Keygen marks the machine as dead → concurrent device enforcement becomes unreliable
2. DDB's `lastSeenAt` never updates → the sliding-window device count drifts
3. The extension never receives server-driven status changes (suspension, revocation, expiry, past-due)
4. Update notifications piggybacked on heartbeat never arrive

---

## 6. Proposed Fix: Fingerprint-Based Device Lookup (SWR Design Direction)

### 6.1 Key Insight

The license key is needed **once** — to bind user + device + license during the `Mouse: Enter License Key` activation flow. After that binding exists in DDB, the device's `fingerprint` uniquely identifies a record that already contains the user, device, and license details. The license key does not need to be retransmitted.

### 6.2 The Fix

**Extension side:** No change. The request schema is already correct:

- `licenseKey` is already optional (`null` for trial users)
- Licensed users whose `licenseKey` happens to be `null` in local state will simply send the three compulsory fields
- If `licenseKey` IS available in local state, it gets sent as before — no regression

**Server side:** A small logic change in `plg-website/src/app/api/license/heartbeat/route.js`:

1. If `licenseKey` is present in the request → use it for DDB lookup (current behavior, unchanged)
2. If `licenseKey` is absent or null, **AND** `fingerprint` is present → look up the device by fingerprint:
   - Query DDB for a device record matching the fingerprint
   - If a paired device exists (user + license already bound) → extract the license key from the device record
   - Continue with normal heartbeat processing using the resolved license details
3. If no paired device is found by fingerprint → respond with `{ valid: false, status: "machine_not_found" }`

### 6.3 Why This Works

- **The binding already exists.** The `Mouse: Enter License Key` flow successfully creates the DDB device record with `fingerprint`, `licenseKey`, `userId`, and all other fields. This has been verified working (Keygen dashboard shows `license.validation.succeeded` and the initial `machine.heartbeat.ping`).
- **Fingerprint is stable.** It's a SHA-256 hash of hardware identifiers. It doesn't change across reboots or VS Code sessions.
- **No auth needed.** The heartbeat endpoint never transmits the license key back to the client. The fingerprint is not a secret (it's a hash of publicly observable machine characteristics), but combined with the requirement that a paired device record must already exist in DDB, it prevents unauthorized lookups. A fingerprint that has never been through the activation flow will simply get `machine_not_found`.
- **No schema change.** The request body is identical. The `licenseKey` field remains optional. The server just becomes smarter about resolving the device when it's absent.
- **Backward compatible.** If the extension does send `licenseKey` (e.g., after a future fix persists it properly), the server uses it directly — no behavior change.

### 6.4 Security Considerations

| Concern                                | Mitigation                                                                                                                                                                                     |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Could an attacker forge a fingerprint? | The fingerprint must match an existing DDB device record created through the authenticated activation flow. Without a prior authenticated binding, the fingerprint resolves to nothing.        |
| License key exposure?                  | **None.** The license key is never returned in the heartbeat response. It's used server-side only to read the license record. The API never echoes it back.                                    |
| Replay attacks?                        | The fingerprint is deterministic — replaying it just pings the same device, which is exactly what a legitimate heartbeat does. There is no state-changing action beyond updating `lastSeenAt`. |
| HTTPS enforcement?                     | Already in place via `validateHttpsUrl()` (CWE-295).                                                                                                                                           |

### 6.5 DDB Query Design

The server needs an efficient way to look up a device by fingerprint when no license key is provided. Two options:

**Option A — GSI on fingerprint:** Add a Global Secondary Index to the DDB table with `fingerprint` as the partition key. This allows a direct `Query` by fingerprint, returning the device record(s) including the associated `licenseKey`.

**Option B — Scan with filter:** Less efficient, not recommended for production.

**Option C — Composite key pattern:** If device records use `LICENSE#{licenseId}/DEVICE#{fingerprint}` as the sort key, and there's already a GSI on fingerprint, the lookup is already possible.

The exact DDB schema should be confirmed in the website repo. The key requirement is: given a `fingerprint`, resolve to the device's `licenseKey` (or directly to the license details) in a single query.

---

## 7. Current Extension-Side Bugs (For Reference)

These are documented in the Phase 2 Implementation Plan and the Comprehensive Heartbeat Issues Analysis. They are **separate from the root-cause license key issue** above but contribute to the overall heartbeat dysfunction:

### 7.1 Stale Validation Allow-List (Problem A)

`VALID_HEARTBEAT_STATUSES` in `licensing/validation.js` contains 11 values, but 5 post-Phase 1 server statuses (`past_due`, `cancellation_pending`, `expired`, `suspended`, `revoked`) are **not in the list**. They are rejected at the validation gate in `http-client.js` before reaching the heartbeat handler.

### 7.2 Casing Mismatch

`_mapServerStatusToState()` in the VSIX heartbeat expects lowercase keys but compares against `config.LICENSE_STATES.*` which are currently UPPERCASE values. The shared core heartbeat has a `.toLowerCase()`/`.toUpperCase()` dance that partially masks this.

### 7.3 Wrong Dispatch Field (HB-2)

The VSIX heartbeat's `_handleInvalidHeartbeat()` dispatches on `response.status` (correct), but the older code path had `switch (response.reason)` which is unreachable. The current codebase dispatches on `response.status`.

### 7.4 Machine Revival Reachability

`_attemptMachineRevival()` (Phase 3D feature for transparent re-activation after `DEACTIVATE_DEAD`) is wired to `case "machine_not_found"`. This handler is reachable now that `machine_not_found` is in the allow-list, but it calls `activateLicense()` which requires `licenseKey` — subject to the same persistence issue described in Section 5.

---

## 8. Relationship to Status Remediation Plan

| Status Remediation Item            | Addressed Here?                              |
| ---------------------------------- | -------------------------------------------- |
| Problem A (stale validation set)   | Documented in §7.1; fix in Phase 2 Files 7-8 |
| Problem B (payment-path confusion) | Documented in §4; fix in Phase 2 Files 9-12  |
| Root-cause heartbeat failure       | **Yes — §5-6 (new discovery)**               |
| Two-dimensional state model        | Not addressed here; see Phase 2 memo         |
| VSIX packaging fix                 | Not addressed here; see Phase 2 memo         |

The fingerprint-based lookup fix (Section 6) is a **server-side change** in the website repo. It is independent of, and complementary to, the extension-side fixes in the Phase 2 Implementation Plan. Both are needed for a fully functional heartbeat lifecycle.

---

## 9. Recommended Execution Sequence

1. **Phase 2 — Extension-side fixes** (this repo): Fix the validation allow-list, casing normalization, and two-dimensional state routing per the [Phase 2 Implementation Plan](20260308_STATUS_REMEDIATION_PROPOSED_PHASE_2_IMPLEMENTATION_PLAN.md). This aligns the extension with the post-Phase 1 server contract.

2. **Phase 3 — Server-side fingerprint-based device lookup** (website repo): Implement the fingerprint-based device resolution described in Section 6, modifying `route.js` so the heartbeat handler can resolve a device from its fingerprint alone when `licenseKey` is absent. This unblocks heartbeats for all licensed users — currently **no** licensed user has `licenseKey` persisted in local state after the activation flow completes, so heartbeats universally fail after the initial ping. (Note: the product is in staging, so there are no existing production users to migrate.)

---

_End of memo._
