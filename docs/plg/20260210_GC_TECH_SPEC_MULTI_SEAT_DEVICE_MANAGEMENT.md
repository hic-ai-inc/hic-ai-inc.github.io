# GC Technical Specification & Implementation Plan: Multi-Seat Device Management

**Date:** 2026-02-10
**Author:** GC (Copilot)
**Status:** REVISED — Incorporating SWR Review (2026-02-11)

> **Note:** The phasing and task ordering in this specification is **superseded** by the [Multi-Seat Implementation Plan V2](20260211_MULTI_SEAT_IMPLEMENTATION_PLAN_V2.md). This document remains the authoritative _architectural_ reference; see the Implementation Plan V2 for current sequencing, decisions, and phase definitions.

**Repos:** `hic` (Mouse extension + licensing core), `hic-ai-inc.github.io` (website + backend)
**References:**

- [20260206 Concurrent Device Handling Implementation Plan](20260206_CONCURRENT_DEVICE_HANDLING_IMPLEMENTATION_PLAN.md)
- [20260126 Mouse Extension Licensing Implementation Plan](20260126_MOUSE_EXTENSION_LICENSING_IMPLEMENTATION_PLAN.md)
- [Security Considerations for Keygen Licensing](20260122_SECURITY_CONSIDERATIONS_FOR_KEYGEN_LICENSING.md)
- [PLG Technical Specification v2](20260122_GC_PLG_TECHNICAL_SPECIFICATION_v2.md)

---

## 1. Executive Summary

The current licensing system cannot enforce per-seat device limits for multi-seat Business licenses. This document specifies the changes required across both repos to:

1. **Authenticate all users at license activation time** via OAuth PKCE against Cognito (supporting both email/password and Gmail SSO via Hosted UI)
2. **Bind devices to individual users** (not just to licenses) in DynamoDB
3. **Enforce the 5-concurrent-device-per-seat rule** for Business licenses at activation and heartbeat time
4. **Scope the portal Devices page** so each Business user sees only their own devices

Authentication is required uniformly at license activation for all license types (Individual and Business). This simplifies logic, ensures user-device binding is always in place, and avoids breakage if an Individual user later upgrades to Business or a single-seat Business license adds additional seats. Trial mode is unaffected — authentication occurs only when the user runs `Mouse: Enter License Key`.

---

## 2. Problem Statement

### 2.1 Current Architecture

When a user runs `Mouse: Enter License Key` in VS Code, the extension sends:

```
POST /api/license/activate
{
  licenseKey,       // shared across all seats in Business
  fingerprint,      // device hash
  deviceName,       // e.g. "MacBook Pro 16"
  platform          // darwin | win32 | linux
}
```

**No user identity is transmitted.** The backend creates a device record in DynamoDB:

```
PK: LICENSE#<keygenLicenseId>
SK: DEVICE#<keygenMachineId>
fingerprint, name, platform, lastSeenAt, createdAt
```

**No `userId` field exists.** The heartbeat follows the same pattern — no user identity.

### 2.2 What Breaks

| Scenario                                      | Expected                                 | Actual                                                    |
| --------------------------------------------- | ---------------------------------------- | --------------------------------------------------------- |
| Business license with 3 seats, 5 devices/seat | Each user can activate up to 5 devices   | All 15 devices counted against one license limit          |
| Portal Devices page for Business member       | User sees their own ≤5 devices           | User sees ALL devices for the entire org                  |
| Admin views device allocation per seat        | Dashboard shows per-user device usage    | No per-user data exists                                   |
| Enforce 5-device max per seat at activation   | Reject if this user already has 5 active | Reject only when the entire license exceeds `maxMachines` |

### 2.3 Root Cause

The `Mouse: Enter License Key` command is a simple `vscode.window.showInputBox` → HTTP POST with **zero authentication**. For Individual licenses (1 user = 1 key), this works because identity is implicit. For Business licenses (N users sharing 1 key), we need to know **which seat-holder** is activating on each device.

### 2.4 Source Files (current state)

#### `hic` repo (Mouse extension + licensing core)

| File                                            | Role                                                                                      |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `mouse-vscode/src/extension.js` (L331-363)      | `mouse.enterLicenseKey` command — `showInputBox` → `activateLicense()`                    |
| `mouse-vscode/src/licensing/license-checker.js` | VS Code wrapper; delegates to core `activate()`                                           |
| `licensing/commands/activate.js`                | Core activate: calls `httpClient.activateLicense(key, fingerprint, deviceName, platform)` |
| `licensing/http-client.js` (L85-107)            | `activateLicense()` — POST to `/api/license/activate`                                     |
| `licensing/state.js`                            | Manages `~/.hic/license.json`; no `userId` field                                          |
| `licensing/heartbeat.js`                        | Sends `{fingerprint, machineId, sessionId, licenseKey}` — no userId                       |

#### `hic-ai-inc.github.io` repo (website + backend)

| File                                                 | Role                                                                        |
| ---------------------------------------------------- | --------------------------------------------------------------------------- |
| `plg-website/src/app/api/license/activate/route.js`  | Activation endpoint — no auth, no userId in device record                   |
| `plg-website/src/app/api/license/heartbeat/route.js` | Heartbeat — per-license enforcement, not per-seat                           |
| `plg-website/src/app/api/portal/devices/route.js`    | Portal API — `getLicenseDevices(licenseId)` returns ALL devices             |
| `plg-website/src/app/portal/devices/page.js`         | Devices UI — renders all devices for the license                            |
| `plg-website/src/lib/dynamodb.js`                    | `addDeviceActivation()` — no userId; `getLicenseDevices()` — no user filter |
| `plg-website/src/lib/keygen.js`                      | Keygen API wrapper — `activateDevice()`, `machineHeartbeat()`               |
| `plg-website/src/lib/constants.js`                   | `PRICING.business.maxConcurrentMachinesPerSeat: 5`                          |

---

## 3. Solution Architecture

### 3.1 Design Principle

**Authenticate at activation time, persist identity with the device record, enforce per-user limits at activation and heartbeat.**

Authentication is enforced uniformly for all license types at activation. This ensures user-device binding is always in place from day one, which is critical for:

- **Single-seat Business:** If the owner later adds team members, their existing device records already have `userId` binding — no migration needed
- **Individual:** If the user later upgrades to Business, the same benefit applies
- **Simplicity:** One activation path, no conditional auth logic based on plan type

Note: Trial mode is completely unaffected. Users can install Mouse and work in trial mode indefinitely without any authentication. Authentication is triggered only when the user runs `Mouse: Enter License Key` to activate a purchased license.

### 3.2 End-to-End Flow (Unified — All License Types)

```
User runs "Mouse: Enter License Key"
  → User enters license key in InputBox
  → Extension validates key format locally (fail fast on bad keys)
  → Extension triggers OAuth PKCE flow via VS Code AuthenticationProvider
    → Opens Cognito Hosted UI in browser
    → User authenticates via email/password OR Gmail SSO (same options as portal)
    → Callback returns to vscode://hic-ai.mouse/callback?code=xxx
    → Extension exchanges code for ID token via PKCE
  → Extension calls POST /api/license/activate
    {licenseKey, fingerprint, deviceName, platform, idToken}
  → Backend:
    1. Verifies Cognito JWT → extracts userId, email
    2. Validates license key
    3. For Business: checks org membership + per-seat limit (≤5 active devices)
    4. For Individual: checks per-license device limit
    5. Creates machine in Keygen
    6. Writes device to DynamoDB WITH userId and userEmail
    7. Returns {success, machineId, userId, planType}
  → Extension stores userId in ~/.hic/license.json
  → User sees "✅ License activated!"
```

**Note on Gmail SSO:** OAuth PKCE is the transport mechanism (how the VS Code extension communicates with Cognito). Gmail SSO is a federated identity provider option within the Cognito Hosted UI. The user sees the same sign-in options — "Sign in with Google" alongside email/password — that they see on the website portal today. The existing Cognito user pool and Google federation configuration are reused as-is. No additional IdP setup is required.

### 3.3 Trial Mode (unchanged — no authentication)

```
User installs Mouse VS Code extension
  → Ctrl-Shift-P > Mouse: Initialize Workspace > Choose client
  → Mouse works immediately in trial mode
  → No authentication, no payment, no license key required
  → Trial nags increase over time (already implemented)
  → When user decides to keep Mouse: purchases on portal, gets license key
  → Then runs "Mouse: Enter License Key" → unified flow above
```

Authentication is never triggered during trial mode. It occurs only at the single point where the user invokes `Mouse: Enter License Key`.

### 3.4 DynamoDB Device Record (updated schema)

```
PK: LICENSE#<keygenLicenseId>
SK: DEVICE#<keygenMachineId>
keygenMachineId: string
fingerprint: string
name: string
platform: string
lastSeenAt: ISO string
createdAt: ISO string
userId: string              ← NEW (Cognito sub — always present for activated devices)
userEmail: string            ← NEW (for display — always present for activated devices)
```

### 3.5 Authentication Approach: VS Code AuthenticationProvider + OAuth PKCE

**Decided approach (SWR-approved):** Implement a custom `AuthenticationProvider` registered as `hic-cognito`. This is the standard VS Code pattern used by GitHub, Azure, and other first-party extensions.

**Why this over browser-poll:**

- First-class integration: appears in VS Code Accounts menu
- Token refresh handled by the framework
- Follows VS Code security best practices (CWE-346 mitigation)
- Users who are already logged in to the portal in their browser get near-instant auth

**Cognito requirements:**

- Same Cognito User Pool as website portal (SWR-approved — no duplication)
- Existing App Client (D3 resolved: use existing, not new) with `vscode://hic-ai.mouse/callback` as allowed callback
- Authorization Code flow with PKCE (no client secret — public client)
- Scopes: `openid email profile`
- Hosted UI (SWR-approved) — supports email/password and Google federation (Gmail SSO)

---

## 4. Implementation Plan — 6 Workstreams, 3 Phases

### Phase 1: Backend Infrastructure (no breaking changes)

#### WS-6: Cognito OAuth Configuration

**Scope:** Infrastructure only, no application code changes.

**Tasks:**

1. Register VS Code extension as an OAuth App Client in Cognito User Pool
   - Grant type: Authorization Code with PKCE
   - Callback URL: `vscode://hic-ai.mouse/callback`
   - Scopes: `openid email profile`
   - No client secret (public client for native apps)
2. Store the new Client ID in AWS Parameter Store / environment config
3. Ensure Cognito Hosted UI domain is configured and reachable

**Deliverable:** Cognito App Client ID available as env var (`COGNITO_VSCODE_CLIENT_ID`).

#### WS-2: Authenticated Activation Endpoint

**Scope:** `hic-ai-inc.github.io` repo.

**Tasks:**

**2a. Modify `POST /api/license/activate`**

- **Require** `idToken` in request body for all activations (uniform auth)
- Verify via existing `CognitoJwtVerifier` → extract `userId` (sub) and `email`
- Validate the license key
- For Business licenses:
  - Verify user is a member of the org that owns this license via `getUserOrgMembership(userId)` or `getOrgMembers(orgId)`
  - Call `getActiveUserDevicesInWindow(keygenLicenseId, userId, windowHours)` → reject if ≥ 5
- For Individual licenses:
  - Check per-license device limit
- Pass `userId` and `userEmail` to `addDeviceActivation()` (always present)

**Note:** The `pre-activate` endpoint from the original draft has been eliminated. Since all activations now require authentication, there is no need to check the plan type before deciding whether to authenticate. Key format validation is handled locally by the extension before triggering the auth flow, providing fast feedback on invalid keys without a server round-trip.

**Files:**

- **Modify:** `plg-website/src/app/api/license/activate/route.js`

#### WS-3: DynamoDB User-Scoped Device Queries

**Scope:** `hic-ai-inc.github.io` repo, `plg-website/src/lib/dynamodb.js`.

**Tasks:**

**3a. Update `addDeviceActivation()`**

Add `userId` and `userEmail` optional parameters. Write them into the device item if provided.

```javascript
export async function addDeviceActivation({
  keygenLicenseId,
  keygenMachineId,
  fingerprint,
  name,
  platform,
  userId, // NEW
  userEmail, // NEW
  metadata = {},
}) {
  // ... existing logic ...
  const item = {
    PK: `LICENSE#${keygenLicenseId}`,
    SK: `DEVICE#${keygenMachineId}`,
    keygenMachineId,
    fingerprint,
    name,
    platform,
    userId: userId || null, // NEW
    userEmail: userEmail || null, // NEW
    lastSeenAt: now,
    ...metadata,
    createdAt: now,
  };
  // ...
}
```

**3b. New function: `getUserDevices()`**

```javascript
/**
 * Get devices for a specific user within a license.
 * Falls back to all devices if userId is null (Individual license).
 */
export async function getUserDevices(keygenLicenseId, userId) {
  if (!userId) {
    return getLicenseDevices(keygenLicenseId);
  }

  const allDevices = await getLicenseDevices(keygenLicenseId);
  return allDevices.filter((d) => d.userId === userId);
}
```

**3c. New function: `getActiveUserDevicesInWindow()`**

```javascript
/**
 * Get active devices for a specific user within the concurrent window.
 */
export async function getActiveUserDevicesInWindow(
  keygenLicenseId,
  userId,
  windowHours = 24,
) {
  const userDevices = await getUserDevices(keygenLicenseId, userId);
  const cutoffTime = new Date(Date.now() - windowHours * 60 * 60 * 1000);

  return userDevices.filter((device) => {
    const lastActivity = new Date(device.lastSeenAt || device.createdAt);
    return lastActivity > cutoffTime;
  });
}
```

**Note on GSI vs. filter:** Device counts per license are small (≤5/user, ≤50/org). A filter expression on the small `LICENSE#` partition is efficient. A GSI is not needed unless we see partition sizes grow past ~100 devices. Revisit post-launch if needed.

---

### Phase 2: Extension Changes (requires Phase 1 APIs)

#### WS-1: VS Code Extension Auth Flow

**Scope:** `hic` repo.

**Tasks:**

**1a. New file: `mouse-vscode/src/licensing/auth-provider.js`**

Implement `vscode.AuthenticationProvider` for Cognito:

```javascript
class HicCognitoAuthProvider {
  constructor(context) {
    /* ... */
  }

  // Standard AuthenticationProvider interface
  async getSessions(scopes) {
    /* check stored tokens */
  }
  async createSession(scopes) {
    // 1. Generate PKCE code_verifier + code_challenge
    // 2. Build Cognito authorize URL with PKCE params
    // 3. Open browser via vscode.env.openExternal()
    // 4. Wait for callback via UriHandler (vscode://hic-ai.mouse/callback)
    // 5. Exchange code for tokens via Cognito /oauth2/token
    // 6. Return AuthenticationSession with idToken as accessToken
  }
  async removeSession(sessionId) {
    /* clear tokens */
  }
}
```

Register in `extension.js`:

```javascript
const authProvider = new HicCognitoAuthProvider(context);
context.subscriptions.push(
  vscode.authentication.registerAuthenticationProvider(
    "hic-cognito",
    "HIC AI Account",
    authProvider,
    { supportsMultipleAccounts: false },
  ),
);
```

**1b. Modify `mouse.enterLicenseKey` command**

```javascript
// After user enters license key:
// 1. Validate key format locally (fail fast)
if (!isValidKeyFormat(key)) {
  vscode.window.showErrorMessage("Invalid license key format.");
  return;
}

// 2. Authenticate — always required (uniform for all license types)
const session = await vscode.authentication.getSession(
  "hic-cognito",
  ["openid", "email"],
  { createIfNone: true },
);
// session.accessToken is the Cognito ID token

// 3. Activate with identity
const result = await licenseChecker.activateLicense(key, session.accessToken);
```

**1c. Modify licensing core (`licensing/` directory)**

- `commands/activate.js`: Accept required `idToken` parameter, pass to `httpClient`
- `http-client.js`: `activateLicense()` accepts required `idToken`, sends in request body
- `state.js`: Add `userId` and `userEmail` fields to `LicenseState`; store after successful activation

**Files:**

- **New:** `mouse-vscode/src/licensing/auth-provider.js`
- **Modify:** `mouse-vscode/src/extension.js` — register auth provider, update enterLicenseKey
- **Modify:** `mouse-vscode/package.json` — declare `authentication` contribution point
- **Modify:** `licensing/commands/activate.js` — accept idToken (required)
- **Modify:** `licensing/http-client.js` — accept/send idToken
- **Modify:** `licensing/state.js` — add userId/userEmail to state schema

#### WS-4: Heartbeat with User Identity

**Scope:** Both repos.

**Tasks:**

**4a. Extension side (`hic` repo)**

- `licensing/http-client.js` → `sendHeartbeat()`: include `userId` from local state
- `licensing/heartbeat.js`: pass userId through

**4b. Backend side (`hic-ai-inc.github.io` repo)**

- `POST /api/license/heartbeat`: if `userId` is present in body:
  - Enforce via `getActiveUserDevicesInWindow(licenseId, userId)` instead of `getActiveDevicesInWindow(licenseId)`
  - Return `concurrentMachines` and `maxMachines` scoped to the user (5 per seat)
- If `userId` is absent: reject with `401 Unauthorized` (authentication required — no backward compat; see Implementation Plan V2, decision D1/D3)

**Files:**

- **Modify:** `licensing/http-client.js` — include userId in heartbeat payload
- **Modify:** `plg-website/src/app/api/license/heartbeat/route.js` — user-scoped enforcement

---

### Phase 3: Portal UI

#### WS-5: Portal Devices Page — User-Scoped View

**Scope:** `hic-ai-inc.github.io` repo.

**Tasks:**

**5a. Backend: `GET /api/portal/devices`**

- Already authenticated via Cognito JWT (tokenPayload.sub available)
- For Business accounts:
  - Look up the org's keygenLicenseId
  - Call `getUserDevices(licenseId, tokenPayload.sub)` instead of `getLicenseDevices(licenseId)`
  - Each team member sees only their own devices
- For Individual accounts: unchanged

**5b. Frontend: `portal/devices/page.js`**

- Minor copy update: "Your active installations" (not "Active installations")
- No structural UI changes needed

**5c. Owner/Admin view (post-launch enhancement — SWR-approved deferral)**

- Add a toggle "View all team devices" visible only to owners/admins
- When toggled, call a new endpoint or pass `?viewAll=true` to devices API
- Renders devices grouped by user email, showing per-user concurrent device counts
- **Not required for initial launch** — each user sees their own device count at launch
- SWR notes this is a logical near-term extension and should be prioritized post-launch

**Files:**

- **Modify:** `plg-website/src/app/api/portal/devices/route.js`
- **Modify:** `plg-website/src/app/portal/devices/page.js` — minor copy

#### ~~WS-7: Migration & Backward Compatibility~~ — REMOVED

**Status:** Eliminated per SWR review (2026-02-11).

**Rationale:** The system is currently hosted on `https://staging.hic-ai.com` with test data only — no real licenses or users exist. All test data will be cleared before launch. Since authentication is now enforced uniformly at activation for all license types, every device record created going forward will have `userId` binding from day one. There are no legacy devices to migrate, no fallback attribution logic needed, and no grace period re-auth prompts to implement.

---

## 5. Security Considerations

### 5.1 Authentication (CWE-306: Missing Auth for Critical Function)

The current activation endpoint performs zero authentication. This is the primary security gap. The solution adds JWT verification for all activations, uniformly across license types.

### 5.2 Token Handling (CWE-522: Insufficiently Protected Credentials)

- PKCE prevents authorization code interception (no client secret)
- ID tokens are held in memory within VS Code's `SecretStorage` (encrypted by OS keychain)
- Tokens are not written to `license.json` — only the `userId` (non-sensitive) is persisted
- Short-lived tokens (1hr Cognito default); refresh tokens stored in SecretStorage

### 5.3 Authorization (CWE-285: Improper Authorization)

- Before allowing any activation, backend verifies:
  1. JWT is valid and not expired
  2. For Business: User's Cognito sub matches an active org member; user has not exceeded per-seat device limit (≤5)
  3. For Individual: Per-license device limit not exceeded
- Keygen `maxMachines` on the license serves as a secondary circuit-breaker

### 5.4 Replay Prevention (CWE-294: Authentication Bypass by Capture-Replay)

- OAuth `state` parameter prevents CSRF
- PKCE `code_verifier` is single-use
- `nonce` in ID token prevents replay

### 5.5 Backward Compatibility (CWE-693: Protection Mechanism Failure)

- Trial mode: zero changes — no authentication required
- Existing test data: will be cleared before launch; no migration needed
- Offline grace (72h) still applies — auth is only required at activation, not during offline operation
- All new activations (Individual and Business) will have user-device binding from day one

---

## 6. Testing Strategy

### 6.1 Unit Tests

| Component                        | Test Cases                                                                    |
| -------------------------------- | ----------------------------------------------------------------------------- |
| `activate` with `idToken`        | Verifies JWT; rejects expired/invalid tokens; extracts userId correctly       |
| `activate` per-seat limit        | Allows activation when user has <5 devices; rejects at ≥5 (Business)         |
| `activate` per-license limit     | Enforces per-license device limit (Individual)                                |
| `getUserDevices()`               | Filters correctly by userId                                                   |
| `getActiveUserDevicesInWindow()` | Correctly applies time window and userId filter                               |
| `addDeviceActivation()`          | Always writes userId/userEmail (non-nullable for activated devices)           |
| Auth provider (extension)        | PKCE flow generates valid code_challenge; handles callback; Gmail SSO works   |
| Heartbeat with userId            | Per-user enforcement for Business; per-license for Individual                 |

### 6.2 Integration Tests

| Journey        | Description                                                                    |
| -------------- | ------------------------------------------------------------------------------ |
| J4.1 (updated) | Business user activates first device with auth → device record has userId      |
| J4.2 (new)     | Business user activates 5 devices → 6th is rejected per-seat                   |
| J4.3 (new)     | Two Business users share same key → each sees only their own devices in portal |
| J4.4 (updated) | Individual user activates with auth → device record has userId                 |
| J4.5 (new)     | User authenticates via Gmail SSO → activation succeeds with correct userId     |
| J4.6 (new)     | User with expired JWT → activation fails with clear error                      |
| J4.7 (new)     | Invalid license key format → rejected locally before auth flow triggered       |

### 6.3 Manual Testing

Required for Keygen integration (per the deprecated J4 test file — requires Keygen Sandbox Environment):

- End-to-end activation with real Keygen sandbox
- Concurrent device enforcement across multiple machines
- Portal devices page shows correct per-user view

---

## 7. Execution Timeline

| Phase       | Workstreams                                     | Estimated Effort | Dependencies     |
| ----------- | ----------------------------------------------- | ---------------- | ---------------- |
| **Phase 1** | WS-6 (Cognito), WS-2 (backend), WS-3 (DynamoDB) | 3–4 days         | None             |
| **Phase 2** | WS-1 (VS Code auth), WS-4 (heartbeat)           | 3–4 days         | Phase 1 complete |
| **Phase 3** | WS-5 (portal UI)                                | 1–2 days         | Phase 2 complete |
| **Total**   |                                                 | **7–10 days**    |                  |

---

## 8. Resolved Decisions (SWR Review — 2026-02-11)

1. **AuthenticationProvider vs. browser-poll:** ✅ **AuthenticationProvider** — provides first-class VS Code Accounts menu integration and automatic token refresh. Standard pattern used by GitHub, Azure, etc.

2. **Cognito Hosted UI vs. embedded login:** ✅ **Hosted UI** — already configured. Handles email/password and Google federation (Gmail SSO) out of the box.

3. **Migration:** ✅ **Not applicable** — system is on staging (`https://staging.hic-ai.com`) with test data only, no real users. All test data will be cleared. WS-7 has been removed from the implementation plan.

4. **Owner/Admin device view:** ✅ **User-only view for launch** — each user sees their own device count. Owner/Admin visibility into per-user device usage is deferred to post-launch (WS-5c). SWR considers this a high-priority near-term enhancement.

5. **Cognito User Pool:** ✅ **Same pool as website portal** — no duplication. Users already have accounts; org membership is already tracked.

6. **Uniform authentication (SWR-initiated):** ✅ **All license types require authentication at activation** — not just Business. This eliminates conditional auth logic, ensures user-device binding is always in place, and prevents breakage when single-seat Business licenses add members or Individual users upgrade. No harm to Individual users (they already have Cognito accounts from the purchase flow).

---

## 9. Appendix: DynamoDB Access Patterns

### Current (broken for Business)

| Pattern                      | PK                          | SK                    | Notes                     |
| ---------------------------- | --------------------------- | --------------------- | ------------------------- |
| Get all devices for license  | `LICENSE#<id>`              | begins_with `DEVICE#` | Returns ALL devices       |
| Get active devices in window | Same + filter by lastSeenAt |                       | Per-license, not per-user |

### Proposed (user-scoped for Business)

| Pattern                            | PK                                     | SK                    | Filter               | Notes         |
| ---------------------------------- | -------------------------------------- | --------------------- | -------------------- | ------------- |
| Get user's devices                 | `LICENSE#<id>`                         | begins_with `DEVICE#` | `userId = :uid`      | Per-user view |
| Get user's active devices          | Same + filter by lastSeenAt AND userId |                       | Per-seat enforcement |
| Get all devices (admin/Individual) | `LICENSE#<id>`                         | begins_with `DEVICE#` | None                 | Unchanged     |

No new GSI required. The `LICENSE#` partition is small enough (≤50 items) that client-side filtering is efficient.

---

_End of specification._
