# Proposal: Browser-Delegated Activation for Multi-Seat Device Binding

**Date:** 2026-02-12  
**Author:** GC (Copilot)  
**Status:** APPROVED — SWR approved 2026-02-12  
**Context:** Approved architectural modification to Phase 3 of the Multi-Seat Device Management Implementation Plan V2  
**Supersedes:** Subphase 3A (Extension Auth Provider) as defined in [20260211_PROPOSED_SUBPHASE_PLAN_FOR_MULTI_USER_PHASE_3.md](../../hic-ai-inc.github.io/docs/plg/20260211_PROPOSED_SUBPHASE_PLAN_FOR_MULTI_USER_PHASE_3.md)  
**Reference Documents:**

- [20260211_MULTI_SEAT_IMPLEMENTATION_PLAN_V2.md](../../hic-ai-inc.github.io/docs/plg/20260211_MULTI_SEAT_IMPLEMENTATION_PLAN_V2.md) — Authoritative phased implementation plan
- [20260211_PROPOSED_SUBPHASE_PLAN_FOR_MULTI_USER_PHASE_3.md](../../hic-ai-inc.github.io/docs/plg/20260211_PROPOSED_SUBPHASE_PLAN_FOR_MULTI_USER_PHASE_3.md) — Current 6-subphase breakdown for Phase 3
- [20260210_GC_TECH_SPEC_MULTI_SEAT_DEVICE_MANAGEMENT.md](20260210_GC_TECH_SPEC_MULTI_SEAT_DEVICE_MANAGEMENT.md) — Original multi-seat specification

---

## 1. Current Setup

Mouse is a VS Code extension distributed as a VSIX file. When a user installs Mouse and initializes a workspace, a 14-day trial begins immediately — no account creation or authentication required. The user's device is identified by a SHA-256 fingerprint derived from hostname, platform, architecture, CPU model, and RAM.

When the user decides to purchase Mouse, they purchase through the website and obtain a license key. Then, to activate it in the workspace:

1. User executes **Ctrl+Shift+P → Mouse: Enter License Key** in VS Code
2. Extension validates the key format
3. Extension calls `POST /api/license/activate` with `{ licenseKey, fingerprint, deviceName, platform }`
4. Backend activates a machine on Keygen, writes a device record to DynamoDB
5. Extension stores `machineId`, `licenseKey`, `fingerprint`, and `status: LICENSED` in `~/.hic/license.json`
6. Heartbeat should begin to maintain machine liveness on Keygen and track device activity in DynamoDB, but currently does not — causing a bug where the status bar and `license_status` revert to Expired for devices that have been shut down and restarted. This bug is slated for fix in Phase 3D. (Note: the heartbeat interval on Keygen has been extended from 15 minutes to 1 hour per D2 resolution.)

This flow works correctly for Individual users and for Business single-user scenarios, because binding a license to a device suffices when there is only one user. The problem emerges exclusively in the **Business multi-user case**: when multiple team members share a single Business license key, the system cannot distinguish between them because **no user identity is captured at any point**. The activation binds a _license key_ to a _device_, but never associates a _user_ with that device. This means:

- Business users sharing a license key cannot be distinguished from each other
- The portal cannot show "your devices" scoped to the logged-in team member
- Per-seat enforcement (5 devices per user on a Business license) is impossible
- An Owner or Admin has no visibility into which team member is using which device

This gap is the root cause of the multi-seat design flaw identified on 2026-02-10 and the impetus for the Multi-Seat Device Management implementation plan.

---

## 2. Current Proposed Alteration (Phase 3 Subphase Plan)

The approved plan to solve the user-device binding problem is documented in the Phase 3 subphase plan (6 subphases, 4.5–7 days estimated). The approach centers on making the VS Code extension an **OAuth 2.1 client** via the VS Code `AuthenticationProvider` API:

### 2.1 What the Current Plan Calls For

**Subphase 3A — Extension Auth Provider (1–1.5 days):**

- Implement `HicCognitoAuthProvider` (~200–250 LOC) using `vscode.AuthenticationProvider`
- PKCE code verifier/challenge generation (crypto operations inside the extension)
- `createSession()` — opens Cognito Hosted UI in browser, with a `vscode://hic-ai.mouse/callback` redirect URI
- `getSessions()` — returns cached session from VS Code's `SecretStorage`
- `removeSession()` — clears stored tokens
- Token refresh via Cognito refresh token (handled by the extension)
- Register `vscode.window.registerUriHandler` to capture the `vscode://` callback
- Register the `authentication` contribution point in `package.json`

**Subphase 3C — Extension Sends idToken (1 day):**

- Wire the auth provider into the activation command
- On `Mouse: Enter License Key`: authenticate → `getSession()` → extract `idToken` → call `activateLicense()` with `Authorization: Bearer {idToken}` header
- Save `userId` / `userEmail` to `license.json` from the server response
- Graceful degradation if auth fails (transitional — removed in 3E)

**Supporting infrastructure:**

- Decision D3 resolved: add `vscode://hic-ai.mouse/callback` to the existing Cognito App Client's callback URLs (already done in Phase 1)
- Token storage in VS Code's `SecretStorage` API (OS-level encrypted storage)
- Token refresh lifecycle management in the extension

### 2.2 Assessment of the Current Plan

The current plan is **correct in its goals** — it would achieve user-device binding and enable all 10 user journeys. However, it carries inherent complexity and risk:

| Concern                               | Detail                                                                                                                                                     |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Extension becomes an OAuth client** | ~250 LOC of security-critical crypto and token management code inside the extension                                                                        |
| **PKCE implementation**               | Must be correct. A subtle bug is a security vulnerability (CWE-330: insufficient randomness, CWE-345: insufficient verification)                           |
| **`vscode://` URI handler**           | Behavior varies across operating systems and is unreliable in remote/container environments (Codespaces, WSL, devcontainers)                               |
| **Token storage**                     | Cognito access/refresh tokens stored in `SecretStorage`. While encrypted at rest, this is a new credential surface that didn't exist before                |
| **Token refresh lifecycle**           | Tokens expire. The extension must detect expiry, refresh proactively, handle refresh failures, and avoid race conditions with the heartbeat loop           |
| **Session management**                | The extension must track "am I authenticated?" state — adding a new dimension to the already-complex `license.json` state machine                          |
| **Attack surface**                    | Tokens on the local machine can be extracted by malware with user-level access, even from `SecretStorage`, by accessing the underlying OS credential store |
| **Ongoing auth requirement**          | Every heartbeat and re-activation must carry a valid JWT, requiring continuous token freshness                                                             |

The current plan mitigates these risks through careful implementation and graceful degradation, but the risks exist because the extension is being asked to do something it fundamentally doesn't need to do: **manage authentication state.**

---

## 3. Proposed Modification: Browser-Delegated Activation

### 3.1 Core Insight

The user-device binding needs to happen **once** — at the moment of license activation. After that binding exists in DynamoDB, the extension never again needs to prove who the user is. The extension only needs to know whether the activation was _successful_, not whether the user is _authenticated_.

Authentication is the browser's job. The website already handles it. Let the browser be the OAuth client, and let the extension simply observe the result.

### 3.2 Proposed Flow

```
VS Code                          Browser                         Backend
──────                          ───────                         ───────
1. User: Mouse: Enter License Key
2. Validate key format
3. Generate fingerprint (existing)
4. Open browser via vscode.env.openExternal():
   https://staging.hic-ai.com/activate
     ?key={licenseKey}
     &fingerprint={fingerprint}
     &deviceName={deviceName}
     &platform={platform}
5. Begin polling loop:
   POST /api/license/validate
   { licenseKey, fingerprint }
   every ~3s, timeout after 5 min
                                 6. /activate page loads
                                    Checks session (existing middleware)
                                    → Not logged in?
                                    → Redirect to Cognito Hosted UI
                                      (standard website auth flow,
                                       existing App Client, existing
                                       callback URLs — nothing new)

                                 7. User signs in (or is already
                                    signed in from a prior session)

                                 8. Cognito redirects back to
                                    /activate?key=...&fingerprint=...
                                    (website has auth session cookie)

                                 9. /activate page (authenticated):  → 10. POST /api/license/activate
                                    Sends request with:                     Authorization: Bearer {JWT}
                                    - JWT from session (auto)               licenseKey, fingerprint,
                                    - licenseKey, fingerprint,              deviceName, platform
                                      deviceName, platform (from URL)

                                                                       11. Activation API (synchronous transaction):
                                                                           a. Verify JWT → userId, userEmail, orgId, role
                                                                           b. Validate license key on Keygen
                                                                           c. Check per-seat device limits (DynamoDB)
                                                                           d. Activate machine on Keygen → machineId
                                                                           e. Write to DynamoDB (MUST succeed before
                                                                              returning 200):
                                                                              LICENSE#/DEVICE# record with
                                                                              userId, userEmail, orgId, role,
                                                                              fingerprint, deviceName, platform,
                                                                              machineId, activatedAt
                                                                           f. Return HTTP 200 { success, machineId,
                                                                              userId, userEmail }

                                                                       [Asynchronous — after DDB write, decoupled
                                                                        from the user-facing response:]
                                                                       DynamoDB Streams → Lambda stream-processor
                                                                         → SNS: DeviceActivated event
                                                                           → Future: notify Owner/Admin
                                                                           → Audit trail / analytics
                                                                           → Any other downstream consumers

                                12. Success page renders
                                    (ONLY after HTTP 200 received —
                                     guarantees DDB record exists):
                                    "✓ Mouse is activated!
                                     You can close this tab
                                     and return to VS Code."

13. Poll response: LICENSED
    (DDB record already exists from
     step 11e — next poll finds it)
    Response includes:
    { status: LICENSED, machineId,
      userId, userEmail }

14. Write to license.json:
    status: LICENSED, machineId,
    userId, userEmail, fingerprint,
    licenseKey

15. Start heartbeat

16. Show VS Code notification:
    "Mouse is now licensed."
```

#### 3.2.1 Consistency Guarantee

The activation API enforces a strict ordering invariant:

> **No HTTP 200 is returned — and therefore no Success page is rendered — unless the DynamoDB write (step 11e) has completed successfully.**

If the DynamoDB write fails, the API returns an error, the browser shows an error state, and the extension's poll never sees LICENSED. No inconsistency is possible. The user cannot reach a state where the browser says "Success" but DynamoDB disagrees.

This also means the extension's polling loop has a natural synchronization point: because the DDB write happens before the HTTP 200, and the HTTP 200 happens before the Success page renders, the DDB record is guaranteed to exist before the user even sees the Success page — and therefore before the next poll cycle.

#### 3.2.2 Event-Driven Downstream Processing

The DynamoDB write in step 11e triggers DynamoDB Streams, which feeds the existing Lambda stream-processor and SNS topic infrastructure. This enables:

- **DeviceActivated event** — published to SNS for any downstream consumers
- **Owner/Admin notification** — a future enhancement where the team Owner or Admin is notified when a member pairs a new device
- **Audit trail** — device activation events logged for compliance and analytics
- **Per-seat usage tracking** — real-time seat consumption updates

These downstream effects are **fully decoupled** from the user-facing activation flow. The Success page does not wait for SNS delivery, Lambda processing, or any downstream consumer. DynamoDB Streams provides millisecond-level propagation, but even if a downstream consumer is slow or fails, the user's activation is unaffected.

#### 3.2.3 Timeout Handling

If the user takes longer than 5 minutes to complete authentication in the browser (slow password entry, 2FA, distraction), the extension's polling loop times out. The extension shows: "Activation timed out. Use **Mouse: Check License Status** to verify."

The DDB record is still written when the user eventually completes authentication — the timeout only affects the extension's awareness, not the backend state. The user can trigger a manual re-check at any time, and the next heartbeat or validation cycle will discover the LICENSED status.

### 3.3 What Changes in the Extension

| File                             | Change                                                                                                                                           | Effort             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ |
| `licensing/commands/activate.js` | After key validation: open browser URL with params, start polling loop, handle timeout/success/error                                             | Moderate (~80 LOC) |
| `licensing/http-client.js`       | Add `pollActivationStatus()` — calls `/api/license/validate` with `fingerprint` + `licenseKey`, returns when status confirms LICENSED or timeout | Small (~40 LOC)    |
| `licensing/constants.js`         | Add `ACTIVATE_URL` (website activation page), `POLL_INTERVAL_MS` (3000), `POLL_TIMEOUT_MS` (300000)                                              | Trivial            |
| `licensing/state.js`             | Add `userId`, `userEmail` fields to the schema (non-secret display identifiers)                                                                  | Trivial            |
| `mouse-vscode/src/extension.js`  | Activation command calls modified `activate.js` which opens browser + polls; no AuthenticationProvider registration                              | Minimal            |

**What is NOT built:**

- No `HicCognitoAuthProvider` class
- No PKCE implementation
- No `vscode://` URI handler
- No `SecretStorage` token management
- No `authentication` contribution point in `package.json`
- No token refresh logic
- No `createSession()` / `getSessions()` / `removeSession()`
- No `Authorization: Bearer` header from the extension — ever

### 3.4 What Changes on the Website

| Component                        | Change                                                                                                                                                                     | Effort               |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `/activate` page (new)           | New page that: (a) accepts URL params, (b) requires auth (redirect to Cognito if not logged in), (c) calls activation API with JWT + device params, (d) shows success page **only after HTTP 200 confirms DDB write** | 1 page (~150 LOC)    |
| `/api/license/activate/route.js` | Accept `Authorization: Bearer {JWT}`, verify, extract `userId`/`userEmail`/`orgId`/`role`, write to DynamoDB (synchronous, must succeed before returning 200), pass to `addDeviceActivation()` — this is already planned in Phase 3B | Same as current plan |
| `/api/license/validate` response | Include `userId`, `userEmail` in response when an activated device is found for the given `fingerprint` + `licenseKey`                                                     | Small                |
| DynamoDB Streams (existing)      | DeviceActivated event triggers downstream Lambda/SNS for Owner/Admin notifications, audit trail, analytics — **decoupled from user-facing flow**                           | Existing infrastructure |

### 3.5 Re-Activation After Machine Deletion (Formerly 3D)

Under `DEACTIVATE_DEAD + NO_REVIVE`, Keygen deletes machines that miss heartbeats for 1 hour. The current plan (Subphase 3D) handles this by re-activating transparently. Under the browser-delegated model, this becomes **simpler**:

1. On startup, extension calls `/api/license/validate` with `licenseKey` + `fingerprint`
2. Backend checks: does a DynamoDB device record exist for this `fingerprint` under this license?
3. **If yes and the user-device binding exists:** the backend can transparently re-activate on Keygen (mint a new machine) without requiring fresh authentication. The `userId` is already recorded in the DynamoDB device record from the original activation. No browser redirect needed.
4. **If no device record exists:** the user must go through the browser activation flow (first-time activation on this device)

This is a critical advantage: **re-activation is auth-free** because the one-time binding in DynamoDB serves as permanent proof of user-device association. The backend trusts the recorded binding; it doesn't need the user to prove their identity again.

### 3.6 Heartbeat Continuity

The heartbeat payload currently includes `{ licenseKey, fingerprint, machineId, sessionId }`. Under this proposal, **nothing changes**. The backend can look up `userId` from the existing DynamoDB device record using the `fingerprint`. No JWT is sent on heartbeats.

---

## 4. Benefits

### 4.1 Security

| Property                         | Original Plan                                                                    | Proposed                                          |
| -------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------- |
| Credentials stored locally       | Cognito access + refresh tokens in `SecretStorage`                               | **None.** Zero local credential storage.          |
| Local attack surface             | `SecretStorage` can be accessed by malware with user-level access (CWE-522)      | **Zero.** Nothing to steal from the extension.    |
| PKCE implementation risk         | Must be correct — subtle bugs are vulnerabilities (CWE-330, CWE-345)             | **Eliminated.** Cognito Hosted UI handles PKCE.   |
| Token refresh race conditions    | Extension must detect expiry + refresh + retry while heartbeat runs concurrently | **Eliminated.** No tokens to refresh.             |
| `vscode://` URI handler exposure | Registered globally; any local process can send a callback URI to the extension  | **Eliminated.** No URI handler registered.        |
| OAuth client surface             | Extension is a full OAuth client with crypto, secrets, session management        | **Extension is not an OAuth client.** Browser is. |

**The extension's auth-related attack surface goes from ~250 LOC of security-critical code to zero.**

### 4.2 Simplicity

| Metric                     | Original Plan                                                                                | Proposed                                                                      |
| -------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| New extension files        | `auth-provider.js` (~250 LOC), `auth-provider.test.js` (~200 LOC)                            | None                                                                          |
| Modified extension files   | `extension.js`, `activate.js`, `http-client.js`, `state.js`, `package.json`                  | `activate.js`, `http-client.js`, `state.js`, `constants.js` (minimal changes) |
| New VS Code APIs used      | `AuthenticationProvider`, `SecretStorage`, `UriHandler`, `authentication` contribution point | `vscode.env.openExternal()` (already used elsewhere)                          |
| New contribution points    | `authenticationProviders` in `package.json`                                                  | None                                                                          |
| Token lifecycle management | Full: acquire, cache, refresh, expire, retry                                                 | None                                                                          |
| State machine additions    | `authenticated` state dimension added to license state                                       | None — only existing states: `LICENSED`, `TRIAL`, `EXPIRED`                   |

### 4.3 Reliability

| Scenario                         | Original Plan                                                                           | Proposed                                                                           |
| -------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Remote containers / Codespaces   | `vscode://` URI handler may not function; callback may never arrive                     | `vscode.env.openExternal()` reliably opens URLs via the connected client's browser |
| WSL environments                 | `vscode://` handler requires Windows-side registration; WSL process cannot register it  | Browser opens on Windows side normally                                             |
| Headless / SSH remote            | `vscode://` callback requires local desktop registration                                | Browser URL can be copied and opened manually on any machine with a browser        |
| Token expiry during long session | Must detect and refresh; if refresh token expires, user must re-authenticate            | N/A — no tokens to expire                                                          |
| VS Code restarts                 | Must reload tokens from `SecretStorage`, verify they're still valid, refresh if expired | Read `license.json` (just `status` + `userId`, no secrets); poll backend if needed |

### 4.4 Alignment with Existing Architecture

The website already has:

- Cognito session management (login, logout, token refresh via cookies)
- JWT verification in all API routes (via `auth-verify.js`, extracted in Phase 1)
- DynamoDB device record writes (via `addDeviceActivation()`, extended in Phase 2)
- All the UI infrastructure (Next.js pages, layout, middleware, error handling)

This proposal **reuses all of it** rather than building a parallel auth stack. The only new website code is one page (`/activate`) that orchestrates the call to the existing API with data that came from the URL parameters.

### 4.5 Reduced Cognitive Load for the User

| Original Plan                                                                                     | Proposed                                                                                       |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| "Sign in with HIC" appears in VS Code Accounts menu. User may be confused about what this is for. | No new UI surface in VS Code. User enters license key, browser opens, familiar web login flow. |
| Two auth flows to understand: website login AND VS Code sign-in                                   | One auth flow: website login (already familiar if they purchased there)                        |
| Token issues may cause mysterious licensing failures                                              | No tokens, no mysterious failures                                                              |

---

## 5. Impact on Existing Plans

### 5.1 Subphase-Level Impact

| Subphase  | Original                                                                            | Under This Proposal                                                                                                                                                    | Revised Effort |
| --------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| **3A**    | Build `HicCognitoAuthProvider` with PKCE, URI handler, `SecretStorage` (1–1.5 days) | **REPLACED:** Modify activation command to open browser URL + poll for activation result (0.5 day)                                                                     | **0.5 day**    |
| **3B**    | Backend accepts optional JWT on activation/heartbeat (0.5–1 day)                    | **UNCHANGED** in substance. JWT comes from website session, not from extension header. Backend code is identical.                                                      | **0.5–1 day**  |
| **3C**    | Wire auth provider into activation flow, send `idToken` (1 day)                     | **ELIMINATED.** The extension doesn't send tokens. The browser + website handle this. Activation command changes absorbed into revised 3A.                             | **0 days**     |
| **3D**    | Fix startup flow / expiry bug: transparent re-activation (1–1.5 days)               | **SIMPLIFIED.** Re-activation is auth-free because the user-device binding in DynamoDB serves as permanent proof. No token needed for re-activation.                   | **0.5–1 day**  |
| **3E**    | Require auth + per-seat enforcement (0.5–1 day)                                     | **UNCHANGED** in substance. "Require auth" means the `/activate` page requires a Cognito session (website middleware). Per-seat enforcement via DynamoDB is identical. | **0.5–1 day**  |
| **3F**    | Portal scoping + UI (0.5–1 day)                                                     | **UNCHANGED.** Portal displays per-user devices. Same DynamoDB queries.                                                                                                | **0.5–1 day**  |
| **Total** | **4.5–7 days**                                                                      |                                                                                                                                                                        | **2.5–4 days** |

**Net savings: ~2 days**, plus a significant reduction in security risk and ongoing maintenance burden.

### 5.2 Decisions Affected

| Decision                                             | Original Resolution                                                   | Impact                                                                                                                   |
| ---------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **D3** (OAuth callback: existing vs. new App Client) | Resolved: add `vscode://hic-ai.mouse/callback` to existing App Client | **No longer relevant.** No `vscode://` callback is used. The redirect stays within the website's existing callback URLs. |
| **D1** (Heartbeat strategy)                          | Resolved: DEACTIVATE_DEAD retained; extension handles re-activation   | **Unchanged,** but re-activation is now simpler (auth-free).                                                             |
| **D2** (heartbeatDuration extension)                 | Resolved: 3600s                                                       | **Unchanged.**                                                                                                           |

### 5.3 Phase 1 Changes

Phase 1 added `vscode://hic-ai.mouse/callback` to the Cognito App Client's callback URLs. This is **no longer needed** under the proposed approach. It is harmless to leave — an unused callback URL has no security impact (Cognito validates the redirect against the registered list, so having an extra URL doesn't weaken anything). It can be cleaned up at any time.

### 5.4 Gate Changes

**Gate 3A (revised):**

- [ ] Extension unit tests pass (`cd licensing && npm test && cd mouse-vscode && npm test`)
- [ ] New/updated tests: `activate.test.js` — browser URL opened with correct params, polling loop handles success/timeout/error
- [ ] New/updated tests: `http-client.test.js` — `pollActivationStatus()` returns LICENSED when backend confirms activation
- [ ] Manual verification: Enter license key → browser opens at correct URL → user can sign in and activate → extension detects activation via polling → `license.json` updated with `userId`, `machineId`, `status: LICENSED`
- [ ] Activation still works for trial users (no behavioral change to trial flow)
- [ ] No `AuthenticationProvider` registered, no `SecretStorage` credentials, no URI handler

**Gate 3C: REMOVED** (absorbed into revised 3A)

All other gates (3B, 3D, 3E, 3F) remain as defined in the current plan except for removal of JWT-from-extension test cases that no longer apply.

### 5.5 User Journey Impact

All 10 user journeys (UJ-1 through UJ-10) remain achievable. The mechanism for achieving UJ-1 (Solo activation) and UJ-5 (Business team member) changes from "extension sends JWT" to "browser sends JWT," but the end state — a user-device binding in DynamoDB — is identical.

### 5.6 Files Not Created

Under this proposal, the following files from the original plan are **not needed:**

- `mouse-vscode/src/licensing/auth-provider.js` (would have been ~250 LOC)
- `mouse-vscode/tests/auth-provider.test.js` (would have been ~200 LOC)

### 5.7 New Website Artifact

One new page is required in the `hic-ai-inc.github.io` repo:

- `/activate` page — receives URL params, enforces auth, calls activation API, displays success

This page shares the website's existing layout, auth middleware, and API calling patterns. Estimated effort: ~150 LOC, 0.5 day. This work is absorbed into Subphase 3B (backend changes) since it's in the same repo.

### 5.8 Future Considerations: Automation Tier

A potential future Automation license tier (for CI/CD pipelines, batch processing, headless environments) would require a non-interactive auth mechanism since containers cannot open a browser. Under this proposal, the architectural path would be:

- **API key authentication** instead of OAuth (the user provisions an API key from the portal)
- **Activation via API call** with the API key header instead of browser flow
- The DynamoDB binding model (user + device + license) remains identical

This is architecturally cleaner than the original plan's path, which would have required building a second auth flow (device code grant or similar) alongside the PKCE flow to support headless environments. Under the browser-delegated model, the interactive and headless flows share the same backend but differ only in how the user proves their identity to the activation endpoint.

---

## 6. Recommendation

Adopt the browser-delegated activation model. The tradeoff is:

| Factor                          | Original                                              | Proposed                                   | Winner       |
| ------------------------------- | ----------------------------------------------------- | ------------------------------------------ | ------------ |
| Lines of code (extension)       | ~500 new LOC (auth + tests)                           | ~120 new LOC (URL + poll + tests)          | Proposed     |
| Security surface                | New credential storage, PKCE crypto, URI handler      | Zero credentials on local machine          | **Proposed** |
| Reliability (containers/remote) | `vscode://` handler unreliable in remote environments | `openExternal()` works everywhere          | **Proposed** |
| User experience                 | VS Code sign-in + license key (two actions)           | License key → browser (one action)         | **Proposed** |
| Timeline                        | 4.5–7 days for Phase 3                                | 2.5–4 days for Phase 3                     | **Proposed** |
| Backend changes                 | Identical                                             | Identical                                  | Tie          |
| Dependency on website           | Lower (extension is self-contained)                   | Higher (requires website `/activate` page) | Original     |

The only advantage of the original plan — lower dependency on the website — is immaterial because the website is in our control, the infrastructure is fully operational, and all the auth plumbing already exists.

**Next steps if approved:**

1. Update `20260211_PROPOSED_SUBPHASE_PLAN_FOR_MULTI_USER_PHASE_3.md` with the revised subphase structure
2. Update `20260211_MULTI_SEAT_IMPLEMENTATION_PLAN_V2.md` Phase 3 section
3. Update `PLG_ROADMAP_v7.md` Phase 5 section
4. Begin implementation in the `hic` repo (revised Subphase 3A)

---

_End of proposal._
