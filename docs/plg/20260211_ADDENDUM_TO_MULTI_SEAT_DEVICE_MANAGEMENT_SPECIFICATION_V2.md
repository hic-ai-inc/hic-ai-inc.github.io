# Addendum to Multi-Seat Device Management Specification

**Date:** 2026-02-11
**Author:** GC (Copilot)
**Status:** FINAL — Infrastructure Audit & Implementation Recommendations
**Supersedes:** [v1](20260211_ADDENDUM_TO_MULTI_SEAT_DEVICE_MANAGEMENT_SPECIFICATION.md) — this version incorporates all decisions made during the 2026-02-11 working session
**Revision (2026-02-11 PM):** Sections 6 and 7 updated to reflect resequenced phasing — Portal UI scoping merged into Phase 2 (Extension Changes) per SWR direction, so E2E testing validates the full stack with portal aligned to backend.
**Parent Document:** [20260210_GC_TECH_SPEC_MULTI_SEAT_DEVICE_MANAGEMENT.md](20260210_GC_TECH_SPEC_MULTI_SEAT_DEVICE_MANAGEMENT.md)
**Repos:** `hic` (Mouse extension + licensing core), `hic-ai-inc.github.io` (website + backend)
**Companion Document:** [20260211_REPORT_ON_KEYGEN_INVESTIGATION.md](20260211_REPORT_ON_KEYGEN_INVESTIGATION.md) — Full Keygen API query results and policy attribute tables

---

## 1. Purpose

This addendum captures the results of a live infrastructure audit, codebase review, and Keygen API investigation performed against the Multi-Seat Device Management specification. The goal is to validate the spec's assumptions against actual AWS and Keygen state, identify gaps, and provide concrete implementation recommendations.

> **V2 Note (2026-02-11):** This is the definitive version of the addendum. It reflects all decisions made during the 2026-02-11 working session: (1) Individual `maxMachines` = 3 confirmed as a settled business decision, (2) `overageStrategy` changed to `ALWAYS_ALLOW_OVERAGE` — Keygen becomes a machine registry only; all concurrency enforcement moves to DynamoDB, (3) concurrency defined by a 2-hour sliding window (`lastHeartbeat > now - 2h`), (4) DEACTIVATE_DEAD + NO_REVIVE retained — the extension handles transparent re-activation, (5) `maxMachines` is decorative (dashboard visibility only). The original v1 is preserved as a historical record of the initial audit. See also [Keygen Investigation Report](20260211_REPORT_ON_KEYGEN_INVESTIGATION.md) for full API query results.

---

## 2. Live AWS Cognito State (Verified 2026-02-11)

All values confirmed via AWS CLI against the live staging environment.

| Resource                 | Value                                                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| User Pool ID             | `us-east-1_CntYimcMm`                                                                                                |
| User Pool Name           | `mouse-staging-v2`                                                                                                   |
| Estimated Users          | 6 (test data only)                                                                                                   |
| App Client ID            | `3jobildap1dobb5vfmiul47bvc`                                                                                         |
| App Client Name          | `mouse-staging-web`                                                                                                  |
| Client Secret            | **None** (public client)                                                                                             |
| OAuth Flow               | Authorization Code (`code`)                                                                                          |
| OAuth Scopes             | `openid`, `email`, `profile`                                                                                         |
| Identity Providers       | `COGNITO`, `Google`                                                                                                  |
| Hosted UI Domain         | `mouse-staging-v2.auth.us-east-1.amazoncognito.com`                                                                  |
| Callback URLs            | `http://localhost:3000/auth/callback`, `https://staging.hic-ai.com/auth/callback`, Amplify preview URL               |
| Logout URLs              | `http://localhost:3000`, `https://staging.hic-ai.com`, Amplify preview URL                                           |
| Lambda Triggers          | `PostConfirmation` → `plg-cognito-post-confirmation-staging`, `PreTokenGeneration` → `plg-cognito-pre-token-staging` |
| Deletion Protection      | INACTIVE                                                                                                             |
| MFA                      | OFF                                                                                                                  |
| Username Attributes      | `email`                                                                                                              |
| Auto-Verified Attributes | `email`                                                                                                              |
| Password Policy          | Min 8 chars, uppercase + lowercase + numbers required, symbols not required                                          |
| Refresh Token Validity   | 30 days                                                                                                              |
| Auth Session Validity    | 3 minutes                                                                                                            |

### 2.1 What Is NOT Yet Configured

- **No `vscode://` callback URL** on the App Client — required for WS-6
- **No second App Client** — only `mouse-staging-web` exists
- **No `COGNITO_VSCODE_CLIENT_ID` env var** in Parameter Store or Amplify config

### 2.2 Spec Assumptions Validated

| Assumption in Spec                            | Verified? | Notes                                          |
| --------------------------------------------- | --------- | ---------------------------------------------- |
| Same Cognito User Pool as portal              | ✅ Yes    | `mouse-staging-v2` is the only relevant pool   |
| Google federation configured                  | ✅ Yes    | Google IdP linked to pool                      |
| Hosted UI domain configured                   | ✅ Yes    | `mouse-staging-v2` prefix                      |
| OAuth scopes `openid email profile` available | ✅ Yes    | Already configured on web client               |
| Authorization Code flow with PKCE possible    | ✅ Yes    | Public client (no secret), `code` flow enabled |
| No real users/data to migrate                 | ✅ Yes    | 6 test users only                              |

---

### 2.3 Live Keygen Policy State (Verified 2026-02-11)

All values confirmed via direct Keygen REST API queries using the Product Token from SSM Parameter Store. Full attribute tables are in the companion [Keygen Investigation Report](20260211_REPORT_ON_KEYGEN_INVESTIGATION.md).

| Setting | Individual | Business | Notes |
| ------- | ---------- | -------- | ----- |
| Policy ID | `91f1947e-...2f84` | `b0bcab98-...9aea` | SSM Parameter Store |
| maxMachines | **3** | **5** | Individual corrected from 2 → 3 (Phase 0) |
| strict | `false` | `false` | Must remain false (ALWAYS_ALLOW_OVERAGE requires it) |
| floating | `true` | `true` | Machines can come and go |
| overageStrategy | **ALWAYS_ALLOW_OVERAGE** | **ALWAYS_ALLOW_OVERAGE** | Keygen never blocks activations; DynamoDB enforces |
| machineLeasingStrategy | PER_LICENSE | PER_LICENSE | All users share the pool |
| requireHeartbeat | `true` | `true` | Heartbeat is mandatory |
| heartbeatDuration | **3600** (1 hour) | **3600** (1 hour) | Extended from 900 in Phase 0 (2026-02-11); reduces machine deletion churn |
| heartbeatCullStrategy | **DEACTIVATE_DEAD** | **DEACTIVATE_DEAD** | ⚠️ Dead machines are permanently deleted |
| heartbeatResurrectionStrategy | **NO_REVIVE** | **NO_REVIVE** | ⚠️ Revival by heartbeat is impossible |
| heartbeatBasis | FROM_FIRST_PING | FROM_FIRST_PING | Timer starts at first heartbeat |
| duration | 2592000 (30 days) | 2592000 (30 days) | License expires 30 days from creation |
| expirationStrategy | RESTRICT_ACCESS | RESTRICT_ACCESS | Access denied after expiry |
| scheme | ED25519_SIGN | ED25519_SIGN | Offline signature verification |

#### 2.3.1 Discrepancies Discovered and Resolved

**1. maxMachines Mismatch (Individual: 2 vs. 3) — RESOLVED**
Keygen had `maxMachines: 2` but the business decision is 3 (`plg-website/src/lib/constants.js`: `maxConcurrentMachines: 3`). ✅ Keygen corrected to 3 in Phase 0 (completed 2026-02-11). With `ALWAYS_ALLOW_OVERAGE`, this value is decorative (dashboard visibility only) — Keygen does not enforce it.

**2. Heartbeat Strategy Is the Opposite of Code Assumptions — RETAINED**
The code assumed KEEP_DEAD + ALWAYS_REVIVE but Keygen is configured as **DEACTIVATE_DEAD + NO_REVIVE** — dead machines are permanently deleted and cannot be revived. After analysis, this configuration is being **retained** because: (a) with `ALWAYS_ALLOW_OVERAGE`, re-activation always succeeds, (b) DEACTIVATE_DEAD auto-cleans dead machines (operational hygiene), and (c) the extension will handle transparent re-activation for laptops waking from sleep. See Section 9 for the license expiry bug fix.

**3. maxMachines Scaling — RESOLVED (Not Required)**
With `ALWAYS_ALLOW_OVERAGE`, Keygen's `maxMachines` is decorative and does not need to scale dynamically with Business seat counts. All concurrency enforcement is via DynamoDB's 2-hour sliding window. Updating `maxMachines` on Keygen for dashboard accuracy is a nice-to-have, not an enforcement requirement.

**4. Status Code Mismatch**
Server heartbeat response sends `status: "over_limit"`, but the extension's `VALID_HEARTBEAT_STATUSES` contains `"concurrent_limit"` instead. Over-limit responses are not recognized.


## 3. Codebase Audit Findings

### 3.1 `hic` Repo (Mouse Extension + Licensing Core)

#### Current State: Zero Authentication

- **No `vscode.AuthenticationProvider`** registered anywhere
- **No `authentication` contribution point** in `mouse-vscode/package.json`
- **No `onAuthenticationRequest` activation event**
- `mouse.enterLicenseKey` is a pure `showInputBox()` → HTTP POST with no identity
- `licensing/state.js` stores: `machineId`, `fingerprint`, `deviceName`, `platform`, `licenseKey`, `status`, `trialStartDate`, `trialEndsAt`, `lastValidation`, `lastHeartbeat`, `sessionId`, `instanceId`, `graceStartedAt`, `lastCheck`, `lastCheckResult`, `checkFailureCount`, `lastNagAt` — **no `userId` or `userEmail`**
- `licensing/http-client.js` sends `activateLicense(key, fingerprint, deviceName, platform)` — **no `idToken`**
- `licensing/heartbeat.js` sends `{fingerprint, machineId, sessionId, licenseKey}` — **no `userId`**

#### Architecture: Two-Layer System

- **Shared core** (`licensing/`): Generic `LicenseStateManager`, `HttpClient`, `HeartbeatManager`, `activate` command — reusable across VS Code and potentially other hosts
- **VSIX wrappers** (`mouse-vscode/src/licensing/`): VS Code-specific `LicenseChecker`, `HeartbeatManager` with UI callbacks, `config.js`, `messages.js`, `validation.js`

#### Notable Discrepancy: API URL Drift

- `licensing/constants.js` → `API_BASE_URL = "https://staging.hic-ai.com"`
- `mouse-vscode/src/licensing/config.js` → `API_BASE_URL: "https://api.hic-ai.com"`
- At runtime the shared core's staging URL is what actually executes. This drift should be reconciled before shipping multi-seat.

### 3.2 `hic-ai-inc.github.io` Repo (Website + Backend)

#### JWT Verification: Exists But Copy-Pasted

`CognitoJwtVerifier` from `aws-jwt-verify` is used in **8 portal API routes**, each with an identical copy-pasted block:

```javascript
import { CognitoJwtVerifier } from "aws-jwt-verify";
const idVerifier = CognitoJwtVerifier.create({
  userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID,
  tokenUse: "id",
  clientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID,
});
```

Routes with JWT verification:

1. `portal/devices/route.js`
2. `checkout/route.js`
3. `provision-license/route.js`
4. `portal/team/route.js`
5. `portal/stripe-session/route.js`
6. `portal/status/route.js`
7. `portal/seats/route.js`
8. `portal/settings/route.js`

Routes **without** JWT verification:

- `/api/license/activate` — unauthenticated (license key only)
- `/api/license/heartbeat` — unauthenticated (license key + checksum)

#### Device Activation: No User Binding

`addDeviceActivation()` in `dynamodb.js` accepts:

```javascript
{
  (keygenLicenseId,
    keygenMachineId,
    fingerprint,
    name,
    platform,
    (metadata = {}));
}
```

**No `userId` or `userEmail` parameters.** Device records are bound to licenses only (`LICENSE#id → DEVICE#machineId`).

#### Device Limits: Soft Enforcement Only

Both `/activate` and `/heartbeat` return device limit violations as **advisory**:

- Activation: returns `overLimit: true` with an upgrade nudge message but **does not reject the activation**
- Heartbeat: returns `status: "over_limit"` but **does not invalidate the session**

This soft enforcement is appropriate for the current single-user model but must become **hard enforcement** for per-seat Business limits. All enforcement will be via DynamoDB's 2-hour sliding window — Keygen does not enforce device limits under `ALWAYS_ALLOW_OVERAGE`.

#### Portal Devices DELETE Bug

The DELETE handler in `portal/devices/route.js` uses `getCustomerLicensesByEmail` but this function is not included in the import statement at the top of the file. This is a pre-existing bug unrelated to multi-seat but should be fixed.

#### `amplify_outputs.json`: Effectively Empty

Contains only `{ "version": "1.4" }`. All Cognito configuration is delivered via environment variables (`NEXT_PUBLIC_COGNITO_USER_POOL_ID`, `NEXT_PUBLIC_COGNITO_CLIENT_ID`, `NEXT_PUBLIC_COGNITO_DOMAIN`).

---

## 4. Key Decision: New App Client vs. Update Existing

The spec (WS-6) calls for registering the VS Code extension as a new OAuth App Client. However, the existing `mouse-staging-web` client is already:

- A **public client** (no secret) — compatible with PKCE
- Configured with `code` flow and the required scopes
- Connected to both `COGNITO` and `Google` providers

### Recommendation: Add `vscode://` callback to the existing client

**Add `vscode://hic-ai.mouse/callback` to the existing `mouse-staging-web` client's callback URLs** rather than creating a separate client.

**Benefits:**

- The backend `CognitoJwtVerifier` is already configured with this client ID across 8 routes — no verifier config changes needed
- One fewer infrastructure artifact to manage
- Same security posture (both are public clients with PKCE)
- No need for a separate `COGNITO_VSCODE_CLIENT_ID` env var — reuse `NEXT_PUBLIC_COGNITO_CLIENT_ID`

**When a separate client would be needed:**

- Different token lifetimes for extension vs. portal (not currently required)
- Different OAuth scopes (not currently required)
- Stricter callback URL isolation for security audit purposes (unlikely for staging)

If SWR prefers a separate client for cleanliness or future divergence, the cost is low — it's just an additional `create-user-pool-client` call plus a new env var.

---

## 5. Tactical Recommendations

### 5.1 Extract Shared `verifyAuthToken()` Utility (Pre-Work)

Before adding JWT verification to `/activate` (WS-2), extract the copy-pasted `CognitoJwtVerifier` pattern from the 8 existing routes into a shared utility:

```
plg-website/src/lib/auth-verify.js
```

This:

- Reduces the WS-2 changeset to a single import
- Eliminates 8 copies of identical code
- Makes future client ID changes a single-line update
- Is a pure refactor with no behavioral change — safe to ship independently

### 5.2 Harden Device Limits from Soft to Hard (DynamoDB Enforcement)

With `ALWAYS_ALLOW_OVERAGE`, Keygen never blocks activations. DynamoDB is the **sole enforcement layer** for device limits.

When implementing WS-2 (authenticated activation), the activation route must check the DynamoDB 2-hour sliding window **before** calling Keygen's `activateDevice`. If the user is at or over their concurrent device limit, return HTTP 403 without ever creating a machine on Keygen. This applies to **both** Individual and Business license types.

"Concurrent" is defined as: devices whose `lastHeartbeat > now - 2 hours` (controlled by `CONCURRENT_DEVICE_WINDOW_HOURS` env var, default: 2).

Suggested response for hard rejection:

```json
{
  "error": "concurrent_device_limit_exceeded",
  "message": "You have reached the maximum of 5 concurrent devices for your seat. Deactivate an existing device or wait for an idle device to fall off (devices inactive for 2+ hours free their slot automatically).",
  "activeDevices": 5,
  "maxDevicesPerSeat": 5
}
```

### 5.3 Resolve API URL Discrepancy

The API base URL drift between `licensing/constants.js` (staging) and `mouse-vscode/src/licensing/config.js` (production) should be reconciled. Options:

1. **Build-time injection** — webpack/esbuild replaces `__API_BASE_URL__` based on build target
2. **Extension setting** — `mouse.apiBaseUrl` in VS Code settings with a sensible default
3. **Single source of truth** — one constants file imported by both layers

Option 1 is cleanest for production vs. staging builds.

### 5.4 Verify Google OAuth Console Redirect URIs

When adding `vscode://hic-ai.mouse/callback` to Cognito, verify whether the Google OAuth console (that backs the Google federation) also needs this URI. Typically Cognito handles the Google redirect itself (Google → Cognito Hosted UI → your callback), so the `vscode://` URI only needs to be in Cognito. But confirm during WS-6 testing to avoid a subtle SSO failure.

### 5.5 Consider `ExplicitAuthFlows` Setting

The current app client doesn't explicitly list `ALLOW_USER_AUTH` or `ALLOW_USER_SRP_AUTH`. For PKCE via Hosted UI this is fine (the OAuth flow doesn't use `InitiateAuth` directly). But if you ever want to support direct API-based auth from the extension without the Hosted UI, ensure `ALLOW_USER_SRP_AUTH` is enabled.

### 5.6 Keygen Heartbeat Strategy: Retain DEACTIVATE_DEAD + NO_REVIVE

The current heartbeat strategy (DEACTIVATE_DEAD + NO_REVIVE) causes machines to be permanently deleted after 15 minutes of missed heartbeats. This was initially flagged as a concern, but with `ALWAYS_ALLOW_OVERAGE` the strategy is now **retained** because:

- **Re-activation always succeeds:** Under `ALWAYS_ALLOW_OVERAGE`, Keygen never blocks. The extension can transparently re-activate after sleep/wake without risk of hitting a device limit error.
- **Auto-cleanup:** Dead machines are automatically removed from Keygen, preventing zombie accumulation. This is especially beneficial for ephemeral environments (Codespaces, CI containers).
- **Enforcement is decoupled:** Since DynamoDB's 2-hour sliding window is the sole enforcement layer, whether Keygen keeps or deletes dead machines has no impact on concurrency limits.

The implementation costs are accepted:

- Every laptop sleep/wake cycle exceeding 15 minutes requires transparent re-activation (extension handles this silently)
- Machine IDs churn on Keygen — DynamoDB records must handle fingerprint-based correlation
- The license expiry bug (Section 9) is fixed by building the re-activation path, not by changing the policy

### 5.7 maxMachines Correction (Individual: 2 → 3) — RESOLVED

The Individual policy was corrected from `maxMachines: 2` to `maxMachines: 3` (completed in Phase 0, 2026-02-11) to match the business decision reflected in `constants.js`. With `ALWAYS_ALLOW_OVERAGE`, this value is decorative (Keygen does not enforce it), but it should be accurate for dashboard visibility.

---

## 6. Concrete Work Items by Phase

### Phase 1: Backend Infrastructure (3–4 days, no breaking changes)

| #   | Task                                                                                        | Files                                                | Difficulty | Notes                                          |
| --- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ---------- | ---------------------------------------------- |
| 1   | **WS-6:** Add `vscode://hic-ai.mouse/callback` to existing App Client callback URLs         | AWS CLI / IaC                                        | Trivial    | 1 command; unblocks everything                 |
| 2   | **WS-6:** Ensure Client ID is available as env var for extension                            | Amplify env / Parameter Store                        | Trivial    | May already be `NEXT_PUBLIC_COGNITO_CLIENT_ID` |
| 3   | **Prep:** Extract shared `verifyAuthToken()` from 8 portal routes into `lib/auth-verify.js` | `plg-website/src/lib/auth-verify.js` + 8 route files | Low        | Pure refactor, no behavioral change            |
| 4   | **WS-3:** Add `userId`/`userEmail` params to `addDeviceActivation()`                        | `plg-website/src/lib/dynamodb.js`                    | Low        | Additive — existing callers unaffected         |
| 5   | **WS-3:** New `getUserDevices()` function                                                   | `plg-website/src/lib/dynamodb.js`                    | Low        | Filter on userId within LICENSE partition      |
| 6   | **WS-3:** New `getActiveUserDevicesInWindow()` function                                     | `plg-website/src/lib/dynamodb.js`                    | Low        | Combines user filter + time window             |
| 7   | **WS-2:** Add JWT verification to `POST /api/license/activate`                              | `plg-website/src/app/api/license/activate/route.js`  | Medium     | Import shared verifier, extract userId/email   |
| 8   | **WS-2:** Add per-seat enforcement logic (Business: hard reject at ≥5 active devices/user)  | Same file                                            | Medium     | New enforcement path for Business licenses     |
| 9   | **Bug fix:** Fix missing `getCustomerLicensesByEmail` import in portal devices DELETE       | `plg-website/src/app/api/portal/devices/route.js`    | Trivial    | Pre-existing bug                               |

### Phase 2: Extension Changes + Portal UI Alignment (5–7 days, requires Phase 1)

> **Revision (2026-02-11 PM):** Portal UI scoping (formerly a separate Phase 3) is merged into this phase so that E2E testing at the end validates the full stack — backend enforcement and portal are aligned before E2E. Extension and backend work are interleaved.

| #   | Task                                                                                | Files                                                        | Difficulty | Notes                                                        |
| --- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------- | ------------------------------------------------------------ |
| 10  | **WS-1:** New `HicCognitoAuthProvider` implementing `vscode.AuthenticationProvider` | `mouse-vscode/src/licensing/auth-provider.js` (~200 LOC)     | **High**   | PKCE, UriHandler, token exchange, SecretStorage              |
| 11  | **WS-1:** Register auth provider in `extension.js`                                  | `mouse-vscode/src/extension.js`                              | Low        | Add registration + dispose                                   |
| 12  | **WS-1:** Add `authentication` contribution point to `package.json`                 | `mouse-vscode/package.json`                                  | Low        | Declares `hic-cognito` provider                              |
| 13  | **WS-1:** Modify `mouse.enterLicenseKey` to authenticate before activating          | `mouse-vscode/src/extension.js`                              | Medium     | Insert auth step between inputBox and activate               |
| 14  | **WS-1:** Thread `idToken` through `activate.js` → `http-client.js`                 | `licensing/commands/activate.js`, `licensing/http-client.js` | Low        | Add required param                                           |
| 15  | **WS-1:** Add `userId`/`userEmail` to `LicenseState` schema                         | `licensing/state.js`                                         | Low        | Persist after successful activation                          |
| 16  | **WS-4:** Add `userId` to heartbeat payload (extension side)                        | `licensing/http-client.js`, `licensing/heartbeat.js`         | Low        | Read from state, include in POST                             |
| 17  | **WS-4:** User-scoped enforcement in heartbeat route (backend)                      | `plg-website/src/app/api/license/heartbeat/route.js`         | Medium     | Conditional: userId present → per-seat; absent → per-license |
| 18  | **WS-5:** Modify portal devices GET to use `getUserDevices()` for Business           | `plg-website/src/app/api/portal/devices/route.js`            | Low        | Use userId from JWT for scoping                               |
| 19  | **WS-5:** Fix portal devices DELETE with ownership authorization                     | `plg-website/src/app/api/portal/devices/route.js`            | Low        | Verify user owns device before deactivation                   |
| 20  | **WS-5:** Minor copy update on devices page                                         | `plg-website/src/app/portal/devices/page.js`                 | Trivial    | "Your active installations", per-seat usage                   |

**Total: 20 discrete tasks, estimated 8.5–11.5 days.**

---

## 7. Suggested Execution Order

> **Revision (2026-02-11 PM):** Resequenced per SWR direction. Portal UI scoping (WS-5) is now done alongside WS-1/WS-4 so that E2E testing validates the full stack with portal aligned to backend.

1. **WS-6 first** — Add `vscode://` callback URL to Cognito App Client (1 CLI command, unblocks all extension work)
2. **Extract `verifyAuthToken()` utility** — Pure refactor, no risk, simplifies everything downstream
3. **WS-3** — DynamoDB functions (`addDeviceActivation` update, `getUserDevices`, `getActiveUserDevicesInWindow`) — additive, no breaking changes
4. **WS-2** — Authenticated activation endpoint — depends on WS-3 functions and shared verifier
5. **WS-1** — VS Code `AuthenticationProvider` — this is the critical path and highest complexity item; build with mock Cognito endpoints for testability
6. **WS-4 + WS-5** — Heartbeat with userId + Portal UI scoping — done together so that E2E testing at the gate validates the full stack (backend enforcement, heartbeat identity, portal device views, and device deactivation all aligned)

The `verifyAuthToken` extraction and the portal devices DELETE bug fix can be shipped immediately as a preparatory PR since they are pure refactors with no behavioral changes.

---

## 8. Risk Assessment

| Risk                                                                 | Likelihood | Impact | Mitigation                                                                             |
| -------------------------------------------------------------------- | ---------- | ------ | -------------------------------------------------------------------------------------- |
| `AuthenticationProvider` PKCE implementation complexity              | Medium     | High   | Reference VS Code GitHub auth provider source; build incrementally with mock endpoints |
| `vscode://` URI handler not firing on all platforms                  | Low        | High   | Test on macOS, Windows, Linux; VS Code has good cross-platform URI handling            |
| Token refresh race conditions during heartbeat                       | Low        | Medium | Use VS Code's built-in token refresh; catch 401 and re-auth gracefully                 |
| Existing portal routes break during `verifyAuthToken` extraction     | Very Low   | Medium | Pure refactor with identical behavior; test each route after extraction                |
| Google SSO callback through Cognito Hosted UI fails with `vscode://` | Very Low   | Medium | Cognito handles Google redirect internally; `vscode://` is only the final hop          |

---

## 9. Note: Existing License Expiry Bug (SWR-Reported, 2026-02-11)

> **Revised 2026-02-11 PM:** Root cause analysis updated after Keygen API investigation revealed the actual heartbeat strategy is DEACTIVATE_DEAD + NO_REVIVE, not KEEP_DEAD + ALWAYS_REVIVE as the code assumed.

### Symptom

SWR reports that when returning to VS Code after a period of inactivity (not always, but sometimes), Mouse shows as **"Expired"** in the status bar and throughout the workspace. Mouse is fully disabled — not just a display error. The only workaround is re-entering the license key via `Mouse: Enter License Key`, after which the license activates normally. The bug is intermittent but reproducibly occurs after the machine has been idle for an extended period.

### Root Cause Analysis (Revised)

The Keygen API investigation (Section 2.3) revealed that the heartbeat strategy is **DEACTIVATE_DEAD + NO_REVIVE** with a 15-minute heartbeat window. This means:

- When a machine misses its heartbeat window, Keygen **permanently deletes** the machine record
- A deleted machine **cannot be revived** by sending a heartbeat — it must be freshly re-activated
- This is not a bug in Keygen — it's working as configured

**What happens on VS Code idle/sleep (>15 minutes):**

```
1. VS Code sleeps or is closed → heartbeat stops
2. After 15 min, Keygen's heartbeatDuration (900s) expires
3. Keygen DEACTIVATES (deletes) the machine record — it no longer exists
4. User reopens VS Code → activate() creates LicenseChecker
5. licenseChecker.checkLicense() → core validate()
   a. Online validation → Keygen says machine not found / not valid
   b. validate() writes status: "EXPIRED" to license.json
6. Heartbeat is gated on status === "LICENSED" → never starts
7. Even if heartbeat started, NO_REVIVE means Keygen would reject it
8. User sees "Mouse: Expired" — only manual re-entry of license key works
```

The bug is **not intermittent** — it is **deterministic** for any idle period exceeding 15 minutes. The apparent intermittency is because the 72-hour offline grace period in the code masks the issue for shorter idle periods (the code uses cached validation results when `lastValidation` is recent enough).

### Contributing Factors

1. **DEACTIVATE_DEAD + NO_REVIVE policy:** The most aggressive heartbeat strategy — machines are deleted, not just marked dead, and cannot be revived. This is the primary cause.

2. **15-minute heartbeat window is very short:** `heartbeatDuration: 900` means any laptop sleep, meeting, or coffee break longer than 15 minutes triggers machine deletion. The code's 10-minute heartbeat interval provides only a 5-minute buffer.

3. **No re-activation path:** When validation discovers the machine was deactivated, the code treats this as a terminal "Expired" state. There is no logic to detect "machine deleted but license still valid" and automatically re-activate.

4. **72-hour offline grace cliff:** The grace period masks the problem for short idle periods but creates a false sense of security. When the grace period expires, the full force of the DEACTIVATE_DEAD policy hits.

5. **Multiple `LicenseStateManager` instances:** `validate()`, `LicenseChecker`, and `startHeartbeatWithCallbacks()` each create separate `new LicenseStateManager()` instances. They all read/write the same `license.json` file on disk but cache `_state` independently in memory, creating potential race conditions during startup.

6. **`lastValidation` vs. `lastHeartbeat` confusion:** The offline grace logic checks `lastValidation`, not `lastHeartbeat`. The VS Code heartbeat wrapper updates both, but the core heartbeat only updates `lastHeartbeat`. If the wrong heartbeat manager is used, grace can expire despite successful heartbeats.

### Fix: Transparent Re-Activation

Since DEACTIVATE_DEAD + NO_REVIVE is being retained (see Section 5.6), the extension must detect deactivated machines and silently re-activate. With `ALWAYS_ALLOW_OVERAGE`, re-activation is guaranteed to succeed on Keygen — there is no risk of hitting a device limit error.

**Startup flow (revised):**

1. On startup, validate the license
2. If validation returns "machine not found" but the license/subscription is still active:
   a. Call the activation endpoint to create a new machine record on Keygen
   b. Update `license.json` with the new `machineId`
   c. Start heartbeat on the new machine
   d. Update DynamoDB device record (same fingerprint, new Keygen machineId)
3. Do all of this silently — the user should never see "Expired" for a recoverable state

**Additional hardening:**
- Consolidate to a single `LicenseStateManager` instance shared across validate, heartbeat, and license checker
- ✅ `heartbeatDuration` extended to 3600 (1 hour) in Phase 0 (2026-02-11) to reduce the frequency of machine death during normal laptop sleep
- Ensure `clearLicenseKey()` is never called as a side effect of a recoverable state — only for genuine revocation or user-initiated deactivation

### Impact on Multi-Seat Plan

This bug fix scopes into **WS-1** (VS Code extension auth flow) and **WS-4** (heartbeat with user identity). The affected files — `extension.js`, `heartbeat.js`, `state.js`, `validate.js`, and `license-checker.js` — are the same files being modified for multi-seat.

Estimated additional effort: ~2–3 days (re-activation flow + DynamoDB handling + testing). This effort is reduced from the original estimate because `ALWAYS_ALLOW_OVERAGE` eliminates the need to handle Keygen 422 errors during silent re-activation.

---

_End of addendum._
