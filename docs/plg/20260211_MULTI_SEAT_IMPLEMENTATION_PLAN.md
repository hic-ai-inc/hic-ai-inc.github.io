# Multi-Seat Device Management: Implementation Plan

**Date:** 2026-02-11
**Author:** GC (Copilot)
**Status:** SUPERSEDED by [Implementation Plan V2](20260211_MULTI_SEAT_IMPLEMENTATION_PLAN_V2.md). Phase 0 completed 2026-02-11 (see V2 for details).
**Prerequisites:** SWR decisions on Keygen heartbeat policy change and heartbeat duration
**Reference Documents:**

- [20260210_GC_TECH_SPEC_MULTI_SEAT_DEVICE_MANAGEMENT.md](20260210_GC_TECH_SPEC_MULTI_SEAT_DEVICE_MANAGEMENT.md) — Original specification
- [20260211_ADDENDUM_TO_MULTI_SEAT_DEVICE_MANAGEMENT_SPECIFICATION.md](20260211_ADDENDUM_TO_MULTI_SEAT_DEVICE_MANAGEMENT_SPECIFICATION.md) — Infrastructure audit & recommendations
- [20260211_REPORT_ON_KEYGEN_INVESTIGATION.md](20260211_REPORT_ON_KEYGEN_INVESTIGATION.md) — Keygen API findings & PER_LICENSE vs PER_USER analysis

---

## 1. Environments

| ID    | Environment                | Location                                          | Test Runner                                                           |
| ----- | -------------------------- | ------------------------------------------------- | --------------------------------------------------------------------- |
| **K** | Keygen Dashboard / API     | `https://api.keygen.sh`                           | Manual verification via API queries                                   |
| **W** | Website + Backend          | `~/source/repos/hic-ai-inc.github.io/plg-website` | `node:test` via `test-runner.js` + HIC test helpers                   |
| **E** | Extension + Licensing Core | `~/source/repos/hic`                              | `node:test` + `node:assert` (licensing/), `node:test` (mouse-vscode/) |
| **A** | AWS (Cognito, SSM)         | AWS Console / CLI                                 | Manual verification via CLI                                           |

---

## 2. SWR Decisions Required Before Work Begins

These decisions gate the implementation. Work cannot proceed until resolved.

| #   | Decision                                                           | Options                                                                       | Recommendation                               |
| --- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------- | -------------------------------------------- |
| D1  | Change heartbeat strategy to KEEP_DEAD + ALWAYS_REVIVE?            | **A:** Yes (recommended) **B:** No, build re-activation logic instead         | A — dramatically simpler                     |
| D2  | Extend `heartbeatDuration` from 900s to 3600s?                     | **A:** Yes **B:** Keep 900s                                                   | A — reduces churn during normal laptop sleep |
| D3  | Add `vscode://` callback to existing App Client or create new one? | **A:** Existing (recommended) **B:** New client                               | A — less infrastructure                      |

> **Resolved:** Individual `maxMachines` is **3**. This was a prior business decision reflected in `plg-website/src/lib/constants.js` (`maxConcurrentMachines: 3`) and throughout the implementation. The Keygen Individual policy currently has `maxMachines: 2`, which is incorrect and will be corrected in Phase 0, Step 0.2.

> **Deferred — Separate Pass:** **Concurrency Model.** How do we define and enforce "concurrent devices"? The current 24-hour DynamoDB activity window, Keygen's heartbeat-based machine lifecycle, and the `maxMachines` hard ceiling interact in ways that can trap good-faith developers — particularly those using Mouse in ephemeral containers (Codespaces, CI runners) alongside a persistent laptop installation. Key sub-questions: (1) When a container stops and the developer self-throttles, how quickly does the slot free up — automatically or only via manual deactivation? (2) What is the right interplay between Keygen's DEACTIVATE_DEAD/KEEP_DEAD strategy and our own DynamoDB window for enabling natural slot recovery? (3) How do we ensure a developer who overuses on Day One can still use Mouse normally on Day Two after reducing their concurrent footprint? This decision affects D1 (heartbeat strategy) and Phase 5 (nag-before-block), and will be addressed in a dedicated concurrency design pass before implementation begins.

---

## 3. User Journeys

These journeys define the end-state we are building towards. Each phase below specifies which journeys become testable upon completion.

| ID        | Journey                 | Description                                                                              | Phase      |
| --------- | ----------------------- | ---------------------------------------------------------------------------------------- | ---------- |
| **UJ-1**  | Solo activation         | Individual user enters license key, authenticates, activates on one device               | Phase 3    |
| **UJ-2**  | Multi-device            | Same user activates on a second device, sees both in portal                              | Phase 3    |
| **UJ-3**  | Device limit hit        | User attempts to exceed per-seat device limit, gets meaningful error + upgrade nudge     | Phase 3    |
| **UJ-4**  | Sleep/wake recovery     | User's laptop sleeps for 1 hour, wakes up, Mouse works without intervention              | Phase 1    |
| **UJ-5**  | Business team member    | Team admin shares license key, member authenticates with own Cognito identity, activates | Phase 3    |
| **UJ-6**  | Business device scoping | Team member sees only their own devices in portal, not other team members'               | Phase 4    |
| **UJ-7**  | Seat limit enforcement  | Business license with 2 seats, 3rd user tries to activate, gets "contact admin" message  | Phase 3    |
| **UJ-8**  | Device deactivation     | User deactivates a device from portal, freeing a slot for a new device                   | Phase 4    |
| **UJ-9**  | Heartbeat with identity | Heartbeat payload includes userId, server tracks per-user device activity                | Phase 3    |
| **UJ-10** | Offline grace           | User is offline for 48 hours, Mouse still works using cached validation                  | All phases |

---

## 4. Implementation Phases

### Legend

- ✅ **Gate:** A testing/validation checkpoint that must pass before proceeding
- 🔧 **Environment:** Which system is being modified
- 📋 **Tests:** What tests must be written or pass
- 🔍 **E2E Assessment:** Whether end-to-end validation is practicable at this point

---

### Phase 0: Keygen Policy Configuration (Pre-Work)

**Goal:** Align Keygen's actual policy settings with the code's assumptions and fix the root cause of the license expiry bug. No code changes. All changes are to the Keygen service configuration via API.

**Environment:** 🔧 K (Keygen API)

#### Step 0.1: Change Heartbeat Strategy (Both Policies)

Execute two API calls to change both Individual and Business policies:

```
PATCH /v1/accounts/{accountId}/policies/{policyId}
Authorization: Bearer {productToken}
Content-Type: application/vnd.api+json

{
  "data": {
    "type": "policies",
    "attributes": {
      "heartbeatCullStrategy": "KEEP_DEAD",
      "heartbeatResurrectionStrategy": "ALWAYS_REVIVE"
    }
  }
}
```

Targets:

- Individual: `91f1947e-0730-48f9-b19a-eb8016ae2f84`
- Business: `b0bcab98-6693-4c44-ad0d-ee3dbb069aea`

#### Step 0.2: Correct maxMachines on Individual Policy (2 → 3)

The Individual policy currently has `maxMachines: 2`, which is incorrect. The business decision is 3 concurrent devices for Individual licenses, as reflected in `plg-website/src/lib/constants.js` (`PRICING.INDIVIDUAL.maxConcurrentMachines: 3`). Correct this now:

```
PATCH /v1/accounts/{accountId}/policies/91f1947e-0730-48f9-b19a-eb8016ae2f84
Authorization: Bearer {productToken}
Content-Type: application/vnd.api+json

{ "data": { "type": "policies", "attributes": { "maxMachines": 3 } } }
```

#### Step 0.3: Consider heartbeatDuration Extension

Pending D2 decision. If yes:

```
PATCH /v1/accounts/{accountId}/policies/{policyId}
{ "data": { "type": "policies", "attributes": { "heartbeatDuration": 3600 } } }
```

Apply to both policies.

#### ✅ Gate 0: Verify Keygen Policy State

**Validation:** Re-query both policies via the API and confirm:

- [ ] `heartbeatCullStrategy: "KEEP_DEAD"` on both
- [ ] `heartbeatResurrectionStrategy: "ALWAYS_REVIVE"` on both
- [ ] `maxMachines: 3` on Individual policy (corrected from 2)
- [ ] `maxMachines: 5` on Business policy (unchanged)
- [ ] `heartbeatDuration` matches the D2 decision on both
- [ ] All other attributes unchanged

**🔍 E2E Assessment:** The expiry bug (UJ-4) should now be _mitigated_ at the Keygen level: a machine that misses heartbeats is marked dead but not deleted, and the next heartbeat revives it. However, the extension code still has the startup deadlock (validates before heartbeating). Full UJ-4 resolution requires Phase 2 extension changes.

**Manual smoke test:** Use an existing test license. Activate on a device. Close VS Code for >15 minutes. Reopen. Expect Mouse should still be in LICENSED state if the offline grace window hasn't expired (within 72 hours). Previously under DEACTIVATE_DEAD, the machine would have been deleted; now under KEEP_DEAD, it should survive and revive on next heartbeat.

**Expected system state after Phase 0:**

- Keygen policies are aligned with code assumptions
- License expiry bug is partially mitigated (machine survives sleep)
- No code changes; no tests to run
- Work can proceed on either repo independently

---

### Phase 1: Cognito Configuration + Auth Utility Extraction (Backend Pre-Work)

**Goal:** Wire up VS Code OAuth callback in Cognito and extract shared authentication utility. Pure infrastructure and refactoring — no behavioral changes to any endpoint.

**Environment:** 🔧 A (AWS Cognito) then 🔧 W (plg-website)

#### Step 1.1: Add `vscode://` Callback URL to Cognito App Client

**Environment:** 🔧 A

```bash
aws cognito-idp update-user-pool-client \
  --user-pool-id us-east-1_CntYimcMm \
  --client-id 3jobildap1dobb5vfmiul47bvc \
  --callback-urls \
    "http://localhost:3000/auth/callback" \
    "https://staging.hic-ai.com/auth/callback" \
    "<existing-amplify-preview-url>" \
    "vscode://hic-ai.mouse/callback" \
  --logout-urls \
    "http://localhost:3000" \
    "https://staging.hic-ai.com" \
    "<existing-amplify-preview-url>"
```

**Validation:**

- [x] `aws cognito-idp describe-user-pool-client` shows `vscode://hic-ai.mouse/callback` in CallbackURLs — ✅ 2026-02-11
- [x] Existing portal login still works (regression check) — ✅ Verified on staging.hic-ai.com 2026-02-11

#### Step 1.2: Extract Shared `verifyAuthToken()` Utility

**Environment:** 🔧 W

Create `plg-website/src/lib/auth-verify.js` (or integrate into existing `auth.js` if more appropriate — check current `auth.js` patterns first):

```javascript
// Shared JWT verification for API routes
// Replaces copy-pasted CognitoJwtVerifier blocks in 8 portal routes
```

Then update all 8 portal routes to import from the shared utility instead of inline construction.

**Files modified:**

- `plg-website/src/lib/auth-verify.js` (new, or extend `auth.js`)
- `plg-website/src/app/api/portal/devices/route.js`
- `plg-website/src/app/api/checkout/route.js`
- `plg-website/src/app/api/provision-license/route.js`
- `plg-website/src/app/api/portal/team/route.js`
- `plg-website/src/app/api/portal/stripe-session/route.js`
- `plg-website/src/app/api/portal/status/route.js`
- `plg-website/src/app/api/portal/seats/route.js`
- `plg-website/src/app/api/portal/settings/route.js`

#### Step 1.3: Fix Portal Devices DELETE Import Bug

**Environment:** 🔧 W

Fix the missing `getCustomerLicensesByEmail` import in `portal/devices/route.js`.

#### ✅ Gate 1: Tests Pass — No Behavioral Change

**📋 Tests to run:**

```bash
cd plg-website && npm test
```

- [x] All existing unit tests pass (1198/1198, 0 failures) — ✅ 2026-02-11
- [x] Specifically: `__tests__/unit/api/portal.test.js` passes — ✅
- [x] Specifically: `__tests__/unit/lib/auth.test.js` passes — ✅

**📋 New tests to write:**

- [x] `__tests__/unit/lib/auth-verify.test.js` — 46 tests covering Bearer parsing, verifier init, decision tree, route wrapper contracts, source code verification — ✅ 2026-02-11
- [x] New tests pass — ✅ 1198/1198 total (31 test files)

**📋 CI/CD:**

- [x] Committed directly to `development`, pushed, CI passed — ✅ 2026-02-11
- [x] CI pipeline passes — ✅ Merged to `main` (commit 1e3011c)

**🔍 E2E Assessment:** Yes — practicable and recommended. Log into the portal at `https://staging.hic-ai.com`, navigate to each protected page (devices, settings, team, etc.) and confirm they still load correctly. This validates the auth extraction didn't break anything.

**Expected system state after Phase 1:**

- Cognito accepts `vscode://` callbacks (unblocks extension OAuth in Phase 3)
- All portal routes use shared auth verification
- DELETE device bug is fixed
- No behavioral changes to any endpoint
- No changes to the extension repo yet

---

### Phase 2: DynamoDB Schema & Function Extensions (Backend)

**Goal:** Add per-user device tracking capability to the DynamoDB layer. Additive changes — all new functions, no modification to existing function signatures.

**Environment:** 🔧 W (plg-website)

#### Step 2.1: Add `userId`/`userEmail` to `addDeviceActivation()`

**File:** `plg-website/src/lib/dynamodb.js`

Extend the function to accept optional `userId` and `userEmail` parameters. When present, store them in the device record. When absent (backward compatibility), omit them.

```javascript
// Before: addDeviceActivation(keygenLicenseId, keygenMachineId, fingerprint, name, platform, metadata)
// After:  addDeviceActivation(keygenLicenseId, keygenMachineId, fingerprint, name, platform, metadata, userId, userEmail)
```

The DynamoDB item gains two new attributes:

- `userId` — Cognito sub (stable unique identifier)
- `userEmail` — human-readable, for display

#### Step 2.2: Add `getUserDevices()` Function

**File:** `plg-website/src/lib/dynamodb.js`

New function: given a `keygenLicenseId` and `userId`, return only that user's device records within the license partition.

#### Step 2.3: Add `getActiveUserDevicesInWindow()` Function

**File:** `plg-website/src/lib/dynamodb.js`

New function: combines the user filter with the existing time-window filter (currently 24 hours) to return only a specific user's active devices.

#### Step 2.4: Consider GSI for User-Based Queries

Evaluate whether a GSI on `userId` is needed for efficient queries. Currently, device records use `PK: LICENSE#{id}, SK: DEVICE#{machineId}`. A query within a license partition filtered by `userId` should be efficient enough for most cases (devices per license is small). Document the decision.

> **✅ Decision (2026-02-11): No GSI.** Partition-level filtering is sufficient. Device counts per license are single-digit to low double-digit. Every call path already has `keygenLicenseId`, so no cross-license query is needed. Revisit if cross-license admin dashboard queries become a requirement.

#### ✅ Gate 2: DynamoDB Functions Tested

**📋 Tests to run:**

```bash
cd plg-website && npm run test:lib
```

- [x] All existing `__tests__/unit/lib/dynamodb.test.js` tests pass (no regression)
- [x] Existing `addDeviceActivation` tests still pass (backward compatible — userId/userEmail are optional)

**📋 New tests to write (in `dynamodb.test.js`):**

- [x] `addDeviceActivation` with userId/userEmail — verify DynamoDB PutItem includes new attributes
- [x] `addDeviceActivation` without userId/userEmail — verify backward compatibility (attributes omitted)
- [x] `getUserDevices` — returns only devices for specified userId within a license
- [x] `getUserDevices` — returns empty array when no devices match userId
- [x] `getUserDevices` — does not return devices belonging to other users on same license
- [x] `getActiveUserDevicesInWindow` — filters by both userId and time window
- [x] `getActiveUserDevicesInWindow` — excludes stale devices outside window
- [x] All new tests pass (19 new tests, 1217 total)

**📋 CI/CD:**

- [x] Push to development, CI passes (commit `263280d`, merged to main 2026-02-11)

**🔍 E2E Assessment:** Not yet practicable. No endpoint consumes these functions with userId yet. The functions are additive and unused by production code paths until Phase 3 wires them into the activate and heartbeat routes.

**Expected system state after Phase 2:**

- DynamoDB layer can store and query per-user device records
- Existing device operations are unchanged (backward compatible)
- No endpoints modified yet — these functions are available but not called with user identity
- Extension still works exactly as before

---

### Phase 3: Authenticated Activation & Per-Seat Enforcement (Backend + Extension)

**Goal:** This is the critical phase. Wire up authentication in the VS Code extension, make the activation endpoint require and verify identity, enforce per-seat device limits, and fix the startup flow. Both repos are modified.

**Environment:** 🔧 E (hic) then 🔧 W (plg-website), interleaved

This phase has sub-steps that must be done in order because the extension and backend must evolve together.

#### Step 3.1: Implement `HicCognitoAuthProvider` in Extension

**Environment:** 🔧 E

**Files:**

- `mouse-vscode/src/licensing/auth-provider.js` (new, ~200-250 LOC)
- `mouse-vscode/package.json` — add `authentication` contribution point
- `mouse-vscode/src/extension.js` — register provider, add UriHandler

Implements `vscode.AuthenticationProvider`:

- `createSession()` — opens Cognito Hosted UI with PKCE, handles `vscode://` callback
- `getSessions()` — returns cached session from SecretStorage
- `removeSession()` — clears stored tokens
- Token refresh via Cognito refresh token
- PKCE code verifier/challenge generation

Also register a `vscode.window.registerUriHandler` to capture the OAuth callback.

#### Step 3.2: Thread `idToken` Through Activation Flow

**Environment:** 🔧 E

**Files:**

- `licensing/commands/activate.js` — accept `idToken` option
- `licensing/http-client.js` — `activateLicense()` sends `Authorization: Bearer {idToken}` header
- `licensing/state.js` — add `userId`, `userEmail` to LicenseState schema
- `mouse-vscode/src/extension.js` — modify `mouse.enterLicenseKey` command to: authenticate → get idToken → then activate

Activation flow becomes:

```
1. User: Mouse: Enter License Key → inputBox for key
2. Extension: getSession() or createSession() → idToken
3. Extension: activateLicense(key, fingerprint, deviceName, platform, idToken)
4. Server: verify JWT, extract userId/email, activate with per-user tracking
5. Extension: save userId/email to license.json state
```

#### Step 3.3: Fix Startup Flow (Expiry Bug)

**Environment:** 🔧 E

**Files:**

- `mouse-vscode/src/extension.js` — reorder: heartbeat first, then validate
- `mouse-vscode/src/licensing/license-checker.js` — handle "dead machine revived by heartbeat" path
- `licensing/state.js` — consolidate to singleton pattern (or document why multiple instances are acceptable)

With KEEP_DEAD + ALWAYS_REVIVE (from Phase 0), the fix is:

1. On startup, if `license.json` has a `licenseKey`, immediately start heartbeat
2. First heartbeat response determines actual status
3. If heartbeat succeeds → machine is alive or revived → set LICENSED
4. If heartbeat fails → validate to determine why → EXPIRED only if truly revoked
5. Never write EXPIRED before giving the heartbeat a chance to revive

#### Step 3.4: Add `userId` to Heartbeat Payload

**Environment:** 🔧 E

**Files:**

- `licensing/http-client.js` — `sendHeartbeat()` accepts and sends `userId`
- `licensing/heartbeat.js` — reads `userId` from state, passes to `sendHeartbeat()`

#### ✅ Gate 3a: Extension Unit Tests Pass

**📋 Tests to run:**

```bash
cd licensing && npm test
cd mouse-vscode && npm test
```

- [ ] All existing `licensing/tests/*.test.js` pass
- [ ] All existing `mouse-vscode/tests/*.test.js` pass

**📋 New tests to write:**

In `licensing/tests/`:

- [ ] `auth-provider.test.js` — PKCE generation, token storage, session lifecycle (mock VS Code APIs)
- [ ] `commands.test.js` — extend: activate with idToken option, activate without idToken (backward compat)
- [ ] `http-client.test.js` (new file — currently missing!) — activateLicense with/without auth header, sendHeartbeat with/without userId, HTTPS enforcement, timeout behavior
- [ ] `heartbeat.test.js` — extend: heartbeat includes userId when present in state
- [ ] `state.test.js` — extend: userId/userEmail storage and retrieval

In `mouse-vscode/tests/`:

- [ ] `licensing.test.js` — extend: startup flow (heartbeat-first), dead machine revival path
- [ ] `heartbeat.test.js` — extend: revival scenario (dead → alive after heartbeat)

- [ ] All new tests pass

**📋 CI/CD:**

- [ ] Push to feature branch on `hic` repo, CI passes (`quality-gates.yml`, `cicd.yml`)

**🔍 E2E Assessment (Extension only):** Partial. The auth provider can be tested manually by:

1. Building the VSIX locally (`npm run package`)
2. Installing in VS Code
3. Running `Mouse: Enter License Key`
4. Confirming the Cognito Hosted UI opens in browser
5. Completing login → confirming the callback returns to VS Code
6. Checking that `~/.hic/license.json` now contains `userId` and `userEmail`

However, full E2E requires the backend changes (Step 3.5+) to process the JWT. Defer full E2E to Gate 3b.

#### Step 3.5: Add JWT Verification to Activation Endpoint

**Environment:** 🔧 W

**File:** `plg-website/src/app/api/license/activate/route.js`

- Import shared `verifyAuthToken()` from Phase 1
- Extract `userId` and `userEmail` from verified JWT
- Pass to `addDeviceActivation()` (Phase 2)
- **Backward compatibility:** If no Authorization header present, activate without userId (supports existing non-authenticated clients during migration)

#### Step 3.6: Add Per-Seat Enforcement to Activation

**Environment:** 🔧 W

**File:** `plg-website/src/app/api/license/activate/route.js`

For authenticated requests on Business licenses:

1. Call `getActiveUserDevicesInWindow(licenseId, userId)` (Phase 2)
2. If active devices ≥ per-seat limit → HTTP 403 with meaningful error (hard reject)
3. If under limit → proceed with Keygen activation + DynamoDB record

For Individual licenses or unauthenticated requests:

- Maintain current behavior (Keygen's `maxMachines` is the enforcement)

#### Step 3.7: Add User-Scoped Heartbeat Processing

**Environment:** 🔧 W

**File:** `plg-website/src/app/api/license/heartbeat/route.js`

- If heartbeat payload contains `userId`: update the device record with `lastHeartbeat` per-user
- If no `userId` (backward compat): use existing per-license behavior
- Fix status code: respond with `concurrent_limit` instead of `over_limit` (or fix extension to accept `over_limit`)

#### ✅ Gate 3b: Full Integration Tests Pass

**📋 Tests to run:**

```bash
cd plg-website && npm test
```

- [ ] All existing tests pass
- [ ] Specifically: `__tests__/unit/api/heartbeat.test.js` passes
- [ ] Specifically: `__tests__/unit/api/license.test.js` passes

**📋 New tests to write:**

In `__tests__/unit/api/`:

- [ ] `license.test.js` — extend: activation with valid JWT → userId stored in DynamoDB
- [ ] `license.test.js` — extend: activation without JWT → backward-compatible (no userId)
- [ ] `license.test.js` — extend: activation with invalid/expired JWT → 401
- [ ] `license.test.js` — extend: Business license, per-seat limit exceeded → 403 with meaningful error
- [ ] `license.test.js` — extend: Business license, per-seat limit not exceeded → 200 success
- [ ] `license.test.js` — extend: Individual license → no per-seat enforcement (Keygen handles it)
- [ ] `heartbeat.test.js` — extend: heartbeat with userId → device record updated with userId
- [ ] `heartbeat.test.js` — extend: heartbeat without userId → backward-compatible behavior
- [ ] `heartbeat.test.js` — extend: status code mismatch fixed (consistent response format)
- [ ] All new tests pass

**📋 CI/CD:**

- [ ] Push both repos to feature branches, CI passes on both
- [ ] Open PRs to `development` on both repos

**🔍 E2E Assessment:** Yes — this is the first point where full end-to-end validation is practicable and **strongly recommended**.

**E2E Test Plan:**

1. **UJ-1 (Solo activation):** Install locally-built VSIX. Enter license key. Cognito Hosted UI opens. Log in. Activation succeeds. `license.json` contains userId/userEmail. DynamoDB device record contains userId/userEmail.
2. **UJ-4 (Sleep/wake recovery):** Activate. Close VS Code. Wait 20 minutes (exceeds old 15-min window). Reopen. Expect Mouse shows LICENSED (not Expired). Heartbeat revived the dead machine.
3. **UJ-10 (Offline grace):** Activate. Disconnect from network. Close VS Code. Wait 1 hour. Reconnect. Reopen. Expect Mouse shows LICENSED (within 72h grace).
4. **Portal check:** Log into `staging.hic-ai.com` portal → Devices page → confirm device shows with user identity.

**Expected system state after Phase 3:**

- Extension authenticates users via Cognito before activation
- Backend verifies JWT and stores per-user device records
- Per-seat enforcement blocks over-limit Business activations with meaningful errors
- Heartbeat includes userId for per-user tracking
- Sleep/wake recovery works without user intervention
- Existing unauthenticated clients continue to work (migration path)
- All unit tests pass in both repos
- E2E validated against staging

---

### Phase 4: Portal UI Scoping & Device Deactivation (Backend + Frontend)

**Goal:** Make the portal device management page user-aware: Business users see only their own devices, Individual users see all their devices. Fix deactivation.

**Environment:** 🔧 W (plg-website)

#### Step 4.1: Scope Portal Devices GET to Current User

**File:** `plg-website/src/app/api/portal/devices/route.js`

For authenticated requests:

- Extract `userId` from JWT
- For Business licenses: call `getUserDevices(licenseId, userId)` → return only this user's devices
- For Individual licenses: return all devices (single user owns all of them)

#### Step 4.2: Fix Portal Devices DELETE

**File:** `plg-website/src/app/api/portal/devices/route.js`

Ensure DELETE:

- Verifies the requesting user owns the device they're trying to deactivate (authorization)
- Calls Keygen to deactivate the machine
- Removes/updates the DynamoDB device record

#### Step 4.3: Update Devices Page UI Copy

**File:** `plg-website/src/app/portal/devices/page.js`

Minor copy updates:

- "Your active installations" (instead of generic "Active devices")
- Show user email next to each device for Business admins who can view all devices
- Show per-seat usage: "3 of 5 devices used"

#### ✅ Gate 4: Portal Tests Pass

**📋 Tests to run:**

```bash
cd plg-website && npm test
```

- [ ] All existing tests pass
- [ ] `__tests__/unit/api/portal.test.js` passes

**📋 New tests to write:**

- [ ] Portal devices GET with Business license → returns only current user's devices
- [ ] Portal devices GET with Individual license → returns all devices
- [ ] Portal devices DELETE → deactivates on Keygen + updates DynamoDB
- [ ] Portal devices DELETE → cannot delete another user's device (authorization)
- [ ] All new tests pass

**📋 CI/CD:**

- [ ] Push to feature branch, CI passes
- [ ] Merge to `development`

**🔍 E2E Assessment:** Yes — full E2E recommended.

**E2E Test Plan:**

1. **UJ-6 (Business device scoping):** Activate with User A identity on Device 1. Activate with User B identity on Device 2 (same license key). User A logs into portal → sees only Device 1. User B logs into portal → sees only Device 2.
2. **UJ-8 (Deactivation):** User deactivates a device from portal. Device count decreases. User can activate on a new device.
3. **UJ-2 (Multi-device):** Activate on two devices. Portal shows both. Deactivate one. Portal shows one.

**Expected system state after Phase 4:**

- Portal shows per-user device views
- Device deactivation works end-to-end
- Business team members see only their own installations
- All user journeys UJ-1 through UJ-10 are operational

---

### Phase 5: Hardening & Dynamic maxMachines (Backend)

**Goal:** Ensure Keygen's global `maxMachines` ceiling stays in sync with the number of seats on Business licenses. Harden the nag-before-block enforcement pattern.

**Environment:** 🔧 W (plg-website)

#### Step 5.1: Dynamic `maxMachines` Override on License Provisioning

**File:** `plg-website/src/lib/keygen.js`

When creating a Business license via `createLicense()`:

- Set per-license `maxMachines = seats × PRICING.BUSINESS.maxConcurrentMachinesPerSeat`
- This overrides the policy default, allowing each Business license to have a ceiling matching its seat count

When seats change (add/remove via portal):

- Update the license's `maxMachines` via Keygen API

#### Step 5.2: Nag-Before-Block Enforcement Gradient

**Files:**

- `plg-website/src/app/api/license/activate/route.js`
- `plg-website/src/app/api/license/heartbeat/route.js`

Implement two thresholds:

- **Soft limit** (e.g., 80% of per-seat max): respond with `status: "approaching_limit"` + upgrade nudge metadata. Activation succeeds.
- **Hard limit** (100% of per-seat max): respond with HTTP 403 + meaningful error.

The soft limit metadata flows through to the extension, which can show a non-blocking notification.

#### Step 5.3: Fix Status Code Alignment

Ensure the heartbeat status codes are consistent between backend and extension:

- **Backend:** uses a defined set of status strings
- **Extension:** `VALID_HEARTBEAT_STATUSES` matches exactly
- Document the contract

#### ✅ Gate 5: Hardening Tests Pass

**📋 New tests:**

- [ ] `keygen.test.js` — createLicense with Business policy sets per-license maxMachines
- [ ] `keygen.test.js` — updateLicenseSeats updates maxMachines proportionally
- [ ] Activation at 80% capacity → `approaching_limit` status + success
- [ ] Activation at 100% capacity → HTTP 403 + error message
- [ ] Heartbeat status codes match extension's expected set
- [ ] All tests pass, CI passes

**🔍 E2E Assessment:** Yes — validate that a Business license with 2 seats and 5 devices/seat has `maxMachines: 10` on Keygen. Activate 4 devices (same user) → no nag. Activate 5th → nag. Attempt 6th → hard block.

**Expected system state after Phase 5:**

- Keygen's `maxMachines` is automatically correct for each Business license
- Nag-before-block provides upgrade nudge without blocking
- Status codes are aligned across all layers
- System is production-ready for multi-seat scenarios

---

## 5. Testing Strategy Summary

### Test Pyramid

| Level           | What                                              | Framework                                                | When                                   |
| --------------- | ------------------------------------------------- | -------------------------------------------------------- | -------------------------------------- |
| **Unit**        | Individual functions, classes, modules            | `node:test` + HIC helpers (W) / `node:test` + assert (E) | After every step                       |
| **Integration** | API route handlers with mocked dependencies       | `node:test` + mocked DynamoDB/Keygen                     | After steps that change route behavior |
| **E2E**         | Full user journeys against staging infrastructure | Manual + `test:e2e:journey` scripts (W)                  | At major gates (3b, 4, 5)              |
| **Smoke**       | Quick manual verification                         | Manual                                                   | After Keygen/Cognito config changes    |

### Test File Mapping

| Source File                                          | Test File                                        | Repo |
| ---------------------------------------------------- | ------------------------------------------------ | ---- |
| `plg-website/src/lib/dynamodb.js`                    | `__tests__/unit/lib/dynamodb.test.js`            | W    |
| `plg-website/src/lib/keygen.js`                      | `__tests__/unit/lib/keygen.test.js`              | W    |
| `plg-website/src/lib/auth-verify.js`                 | `__tests__/unit/lib/auth-verify.test.js`         | W    |
| `plg-website/src/app/api/license/activate/route.js`  | `__tests__/unit/api/license.test.js`             | W    |
| `plg-website/src/app/api/license/heartbeat/route.js` | `__tests__/unit/api/heartbeat.test.js`           | W    |
| `plg-website/src/app/api/portal/devices/route.js`    | `__tests__/unit/api/portal.test.js`              | W    |
| `licensing/http-client.js`                           | `licensing/tests/http-client.test.js` (NEW)      | E    |
| `licensing/commands/activate.js`                     | `licensing/tests/commands.test.js`               | E    |
| `licensing/state.js`                                 | `licensing/tests/state.test.js`                  | E    |
| `licensing/heartbeat.js`                             | `licensing/tests/heartbeat.test.js`              | E    |
| `mouse-vscode/src/licensing/auth-provider.js`        | `mouse-vscode/tests/auth-provider.test.js` (NEW) | E    |
| `mouse-vscode/src/licensing/license-checker.js`      | `mouse-vscode/tests/licensing.test.js`           | E    |

### E2E Journey Tests (Existing)

The `__tests__/e2e/journeys/` directory already contains relevant journey tests:

- `j3-license-activation.test.js` — extend for authenticated activation
- `j4-multi-device.test.js` — extend for per-user scoping
- `j5-heartbeat-loop.test.js` — extend for userId in payload
- `j6-concurrent-limits.test.js` — extend for per-seat enforcement

These should be updated as part of each phase's test expansion, not rewritten.

---

## 6. Dependency Graph

```
Phase 0 (Keygen config)
    │
    ├──→ Phase 1 (Cognito + auth extract)    [independent of Phase 0 result]
    │         │
    │         └──→ Phase 2 (DynamoDB functions)
    │                   │
    │                   └──→ Phase 3 (Auth + activation + heartbeat)
    │                             │
    │                             ├──→ Phase 4 (Portal UI)
    │                             │
    │                             └──→ Phase 5 (Hardening + maxMachines sync)
    │
    └──→ Phase 3, Step 3.3 (Expiry bug fix)  [depends on Phase 0 policy change]
```

- Phase 0 and Phase 1 can be done in parallel (different environments)
- Phase 2 depends on Phase 1 (shared auth utility needed)
- Phase 3 depends on Phase 0 (heartbeat strategy) and Phase 2 (DynamoDB functions)
- Phases 4 and 5 depend on Phase 3 but are independent of each other

---

## 7. Effort Estimates

| Phase     | Environment | Effort            | Cumulative    |
| --------- | ----------- | ----------------- | ------------- |
| Phase 0   | K           | 0.5 day           | 0.5 day       |
| Phase 1   | A + W       | 1 day             | 1.5 days      |
| Phase 2   | W           | 1 day             | 2.5 days      | ✅ Done 2026-02-11 |
| Phase 3   | E + W       | 4–5 days          | 6.5–7.5 days  |
| Phase 4   | W           | 1–2 days          | 7.5–9.5 days  |
| Phase 5   | W           | 1–2 days          | 8.5–11.5 days |
| **Total** |             | **8.5–11.5 days** |               |

Phase 3 is the critical path. It contains the highest-complexity work (AuthenticationProvider, PKCE, startup flow fix) and requires both repos to evolve in lockstep.

---

## 8. Risk Mitigation

| Risk                                                             | Mitigation                                                                                               | Phase |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----- |
| Keygen policy change causes unexpected behavior                  | Query policies after change to confirm; smoke test with existing license                                 | 0     |
| Auth extraction breaks portal routes                             | Pure refactor; identical behavior; test every route                                                      | 1     |
| PKCE implementation complexity                                   | Reference VS Code GitHub auth provider; mock Cognito for unit tests                                      | 3     |
| `vscode://` URI handler inconsistency across OS                  | Test on Windows, macOS, Linux; VS Code has good cross-platform support                                   | 3     |
| Extension + backend version mismatch during rollout              | Backward compatibility: backend accepts both authenticated and unauthenticated requests during migration | 3     |
| Token refresh race during heartbeat                              | Catch 401 → refresh → retry pattern; test with mock expired tokens                                       | 3     |
| DynamoDB device record churn (if heartbeat strategy not changed) | Phase 0 resolves this; if D1 decision is "No", add re-activation logic                                   | 0/3   |

---

## 9. Definition of Done

The multi-seat implementation is complete when:

- [ ] All user journeys UJ-1 through UJ-10 pass end-to-end against staging
- [ ] All unit tests pass in both repos with >80% coverage on modified files
- [ ] CI/CD passes on both repos with merged PRs to `development`
- [ ] Extension can be built as VSIX and installed fresh, completing UJ-1 successfully
- [ ] A Business license with 2 seats correctly limits each user to 5 devices
- [ ] The portal shows per-user device views for Business licenses
- [ ] Sleep/wake recovery works without user intervention (UJ-4)
- [ ] Unauthenticated legacy clients still work (backward compatibility)
- [ ] Nag-before-block messaging works at 80% device capacity
- [ ] No hardcoded secrets; all credentials from SSM/SecretStorage
- [ ] Documentation updated with API contract for authenticated activation

---

_End of implementation plan._
