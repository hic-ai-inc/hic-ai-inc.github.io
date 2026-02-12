# Proposed Subphase Plan for Multi-User Phase 3

**Date:** 2026-02-11
**Author:** Copilot (with SWR approval)
**Status:** PROPOSED — Pending acceptance before updating main plan documents
**Context:** Phase 3 of the Multi-Seat Implementation Plan is the most complex phase (5–7 days estimated, two repos, breaking behavioral changes). Phases 0–2 each went smoothly because they were additive and independently deployable. This proposal restructures Phase 3 into 6 subphases that preserve that property.

---

## 1. Problem Statement

The original Phase 3 plan is a "big bang" deployment:

- **Two repos change simultaneously** — the VS Code extension (`hic`) and the backend (`plg-website`) must both be deployed together for anything to work.
- **Authentication flips from optional to required in one shot** — if anything goes wrong, debugging spans the full stack.
- **No rollback granularity** — reverting means reverting everything.

This is the opposite of what made Phases 0–2 smooth: each was additive, independently testable, and introduced zero behavioral changes to production.

> **Note:** Mouse has not yet been published to the VS Code Marketplace. All testing uses locally-built VSIX files installed via `code --install-extension`. This eliminates any concern about auto-update windows or stale extension versions in the wild — we control exactly when the extension is updated.

---

## 2. Proposed Subphase Breakdown

### Subphase 3A: Extension Auth Provider (Extension-Only)

**Goal:** Build the auth provider. Change nothing else.

**Environment:** 🔧 E (`hic` repo)

**Files:**

- `mouse-vscode/src/licensing/auth-provider.js` (new, ~200–250 LOC)
- `mouse-vscode/package.json` — add `authentication` contribution point
- `mouse-vscode/src/extension.js` — register provider, add UriHandler

**Work:**

- Implement `HicCognitoAuthProvider` using VS Code's `vscode.AuthenticationProvider` API
- PKCE code verifier/challenge generation
- `createSession()` — opens Cognito Hosted UI with PKCE, handles `vscode://hic-ai.mouse/callback` callback
- `getSessions()` — returns cached session from SecretStorage
- `removeSession()` — clears stored tokens
- Token refresh via Cognito refresh token
- Register `vscode.window.registerUriHandler` to capture the OAuth callback
- **Do NOT wire it into activation yet** — it's just available as an account provider

**Gate 3A:**

- [ ] Extension unit tests pass (`cd licensing && npm test && cd mouse-vscode && npm test`)
- [ ] New tests: `auth-provider.test.js` — PKCE generation, token storage, session lifecycle (mock VS Code APIs)
- [ ] Manual verification: "Sign in with HIC" appears in VS Code Accounts menu
- [ ] Manual verification: Cognito Hosted UI opens in browser when sign-in initiated
- [ ] Manual verification: Callback returns to VS Code, token stored in SecretStorage
- [ ] Activation still works exactly as before (unauthenticated) — zero behavioral change

**Risk: Zero.** No behavioral change to any existing functionality.

**Dependency:** None (independent of 3B–3F).

---

### Subphase 3B: Backend Accepts Optional JWT (Backend-Only, Backward Compatible)

**Goal:** If a JWT arrives on an activation or heartbeat request, verify it and store userId/userEmail. If no JWT, proceed as before.

**Environment:** 🔧 W (`plg-website` repo)

**Files:**

- `plg-website/src/app/api/license/activate/route.js`
- `plg-website/src/app/api/license/heartbeat/route.js`

**Work:**

- **Activation endpoint:** Check for `Authorization: Bearer {token}` header. If present → call `verifyAuthToken()` (Phase 1) → extract userId/userEmail → pass to `addDeviceActivation()` (Phase 2). If absent → proceed without them (existing behavior preserved).
- **Heartbeat endpoint:** If `userId` in payload → store it via device record update. If absent → proceed as before.
- **Update caller fallbacks** from `|| 24` to `|| 2` for `CONCURRENT_DEVICE_WINDOW_HOURS` — the Phase 2 deferred action item. This is a safe behavioral change because the env var is set in staging/production; the fallback is only reached if the env var is missing.

**Gate 3B:**

- [ ] All existing tests pass (1217+ currently, no regression)
- [ ] New tests: activation WITH valid JWT → userId/userEmail stored in DynamoDB
- [ ] New tests: activation WITHOUT JWT → proceeds normally (backward compatible)
- [ ] New tests: activation WITH invalid/expired JWT → 401 rejection (bad token ≠ no token)
- [ ] New tests: heartbeat WITH userId → device record updated
- [ ] New tests: heartbeat WITHOUT userId → proceeds normally (backward compatible)
- [ ] CI/CD passes
- [ ] E2E: Deploy to staging → existing extension (no auth) still activates successfully

**Risk: Near zero.** Purely additive. Old clients are completely unaffected. The only new code path is triggered by a header that no client currently sends.

**Dependency:** Phase 1 (auth-verify.js) and Phase 2 (dynamodb.js functions) — both complete.

**Key Design Decision:** The distinction between "no Authorization header" and "invalid Authorization header" is important:

- **No header** → backward-compatible, proceed without userId (transitional)
- **Header present but invalid/expired** → 401 rejection (client tried to authenticate and failed; this is an error, not a graceful degradation)

---

### Subphase 3C: Extension Sends idToken (Extension Change)

**Goal:** Wire the auth provider (3A) into the activation flow. The backend (3B) already handles it.

**Environment:** 🔧 E (`hic` repo)

**Files:**

- `licensing/commands/activate.js` — accept `idToken` option
- `licensing/http-client.js` — `activateLicense()` sends `Authorization: Bearer {idToken}` header
- `licensing/state.js` — add `userId`, `userEmail` to LicenseState schema
- `mouse-vscode/src/extension.js` — modify `mouse.enterLicenseKey` command to: authenticate → get idToken → then activate

**Work:**

- Activation flow becomes: User enters license key → `getSession()` (prompts sign-in if needed) → `activateLicense(key, fingerprint, deviceName, platform, idToken)` → server verifies JWT and stores userId
- **Graceful degradation:** If auth fails or user cancels sign-in → activation still proceeds without token. Backend is backward-compatible from 3B, so this works. This is transitional — removed in 3E when auth becomes required.
- Save userId/userEmail to `license.json` when returned by server

**Error Handling & Auth Failure UX:**

- **Expired token:** Treat as "no session" → redirect to sign-in flow
- **User cancels sign-in:** Proceed with unauthenticated activation (transitional)
- **Server returns 401 for bad token:** Dismiss activation gracefully, restore prior state, show "Sign-in required to activate"
- **Server error (5xx) or network failure:** Dismiss activation, restore prior state, show transient notification
- **No broken intermediate state:** If activation fails for any reason, the extension MUST NOT enter a half-activated state

**Gate 3C:**

- [ ] Extension unit tests pass
- [ ] New/updated tests: `commands.test.js` — activate with idToken (sends header), activate without idToken (still works, no header)
- [ ] New/updated tests: `http-client.test.js` — activateLicense with auth header, activateLicense without auth header (both succeed differently)
- [ ] New/updated tests: `state.test.js` — userId/userEmail storage and retrieval
- [ ] Manual E2E against staging: activate with sign-in → DynamoDB record has userId/userEmail
- [ ] Manual E2E against staging: cancel sign-in → activation still succeeds without userId (degraded)

**Risk: Low.** Graceful degradation means nothing breaks if auth fails. Backend already handles both paths.

**Dependency:** 3A (auth provider exists) and 3B (backend accepts optional JWT).

---

### Subphase 3D: Fix Startup Flow / Expiry Bug (Extension Change)

**Goal:** Fix UJ-4 (sleep/wake recovery) — independent of auth, can be done in parallel with 3A–3C.

**Environment:** 🔧 E (`hic` repo)

**Files:**

- `mouse-vscode/src/extension.js` — reorder: heartbeat first, then validate
- `mouse-vscode/src/licensing/license-checker.js` — handle "dead machine revived" path
- `licensing/state.js` — consolidate to singleton pattern (or document why multiple instances are acceptable)

**Work:**
With DEACTIVATE_DEAD + NO_REVIVE (retained) and ALWAYS_ALLOW_OVERAGE (Phase 0):

1. On startup, if `license.json` has a `licenseKey`, validate the license
2. If validation returns "machine not found" but license/subscription is still active:
   a. Transparently re-activate by calling the activation endpoint
   b. Update `license.json` with the new `machineId`
   c. Start heartbeat on the new machine
   d. Update DynamoDB device record: look up existing record by fingerprint within the license partition and update its `keygenMachineId` (do NOT create a new record — preserves lifecycle history)
3. If validation succeeds → machine alive → set LICENSED, start heartbeat
4. EXPIRED only if the license/subscription itself is truly revoked or expired
5. Never write EXPIRED for a recoverable "machine deleted" state

With `ALWAYS_ALLOW_OVERAGE`, re-activation is guaranteed to succeed — no risk of hitting a device limit error during transparent recovery.

**Note:** This works with or without auth. If 3C is deployed, re-activation carries userId. If not, re-activation is unauthenticated (backend handles both via 3B backward compatibility).

**Gate 3D:**

- [ ] Extension unit tests pass
- [ ] New/updated tests: `licensing.test.js` — startup flow (heartbeat-first), dead machine revival path
- [ ] New/updated tests: `heartbeat.test.js` — revival scenario (dead → alive after re-activation)
- [ ] Manual E2E: activate → close VS Code → wait 20 minutes → reopen → still LICENSED (not Expired)

**Risk: Low.** Isolated to extension startup logic. ALWAYS_ALLOW_OVERAGE guarantees re-activation success.

**Dependency:** None for basic fix. Full auth-aware re-activation additionally depends on 3C.

**Parallel Opportunity:** 3D can be developed and tested in parallel with 3A–3C since it doesn't touch the auth flow. The only coordination point: if 3C is also deployed, re-activation should send the idToken.

---

### Subphase 3E: Require Auth + Per-Seat Enforcement (Backend, Breaking Change)

**Goal:** Flip the switch — authentication is now required. Enforce per-seat device limits.

**Environment:** 🔧 W (`plg-website` repo)

**Files:**

- `plg-website/src/app/api/license/activate/route.js`
- `plg-website/src/app/api/license/heartbeat/route.js`

**Work:**

- **Remove backward-compatible fallback:** Activation without JWT → HTTP 401 Unauthorized. No unauthenticated activation path.
- **Per-seat enforcement (Business licenses):** Call `getActiveUserDevicesInWindow(licenseId, userId)` → if active devices ≥ per-seat limit → HTTP 403 with meaningful error
- **Per-license enforcement (Individual licenses):** Same mechanism but using per-license limit instead of per-seat limit. DynamoDB is the sole enforcement layer (Keygen has ALWAYS_ALLOW_OVERAGE).
- **Heartbeat without userId:** Return HTTP 401 (or, during a brief transition period, log warning and apply per-license fallback behavior — then remove fallback promptly)

**Gate 3E:**

- [ ] All existing tests pass (updated to reflect auth-required behavior)
- [ ] New tests: activation without JWT → 401
- [ ] New tests: Business license, per-seat limit exceeded → 403 with meaningful error body
- [ ] New tests: Business license, per-seat limit not exceeded → 200 success
- [ ] New tests: Individual license → DynamoDB-based device limit enforcement (2-hour sliding window)
- [ ] New tests: heartbeat without userId → 401 (or warning with fallback)
- [ ] CI/CD passes
- [ ] E2E: activation without auth → 401. Activation with auth, under limit → 200. Over limit → 403.

**Risk: Low.** Since Mouse is not yet published to the VS Code Marketplace (all installs are via local VSIX), there are no stale extension versions in the wild. We control exactly when the extension is updated, so 3C (extension sends tokens) and 3E (backend requires tokens) can be deployed on the same day with no gap. The only prerequisite is that the VSIX installed for testing includes the 3C auth changes before 3E goes live.

**Dependency:** 3B (backend accepts JWT, already deployed) and 3C (extension sends JWT, VSIX built and installed).

---

### Subphase 3F: Portal Scoping + UI (Backend + Frontend)

**Goal:** Align the portal UI with per-user device model. Cosmetic + authorization, no new protocol changes.

**Environment:** 🔧 W (`plg-website` repo)

**Files:**

- `plg-website/src/app/api/portal/devices/route.js` — GET and DELETE handlers
- `plg-website/src/app/portal/devices/page.js` — UI copy and layout

**Work:**

- **Scope devices GET:** Extract userId from JWT. Business licenses → call `getUserDevices(licenseId, userId)` → return only this user's devices. Individual licenses → return all devices.
- **Fix devices DELETE authorization:** Verify requesting user owns the device they're deactivating. Call Keygen to deactivate the machine. Remove/update DynamoDB device record.
- **UI copy updates:** "Your active installations" (not "Active devices"). Show user email for Business admins. Show per-seat usage: "3 of 5 devices used".

**Gate 3F:**

- [ ] All existing tests pass
- [ ] New tests: Portal devices GET with Business license → returns only current user's devices
- [ ] New tests: Portal devices GET with Individual license → returns all devices
- [ ] New tests: Portal devices DELETE → deactivates on Keygen + updates DynamoDB
- [ ] New tests: Portal devices DELETE → cannot delete another user's device (403)
- [ ] CI/CD passes
- [ ] E2E: User A sees only their devices, User B sees only theirs. Deactivation works end-to-end.

**Risk: Low.** UI + query filtering, no protocol changes. Auth and enforcement are already in place from 3E.

**Dependency:** 3E (auth required, per-seat enforcement active) — though 3F can technically be developed in parallel with 3E since it uses the same auth patterns.

---

## 3. Comparison: Original vs. Subphased

| Property                           | Original Phase 3                   | Subphased Phase 3                    |
| ---------------------------------- | ---------------------------------- | ------------------------------------ |
| Deployments                        | 1 (both repos simultaneously)      | 6 (each independent)                 |
| Backward compatible during rollout | No                                 | Yes, until 3E                        |
| Can test incrementally             | No — full E2E only                 | Yes — each subphase has its own gate |
| Rollback granularity               | All or nothing                     | Per-subphase                         |
| Extension auto-update window       | N/A (not yet on Marketplace)       | N/A (VSIX install is controlled)     |
| Debugging surface                  | Full stack                         | One layer at a time                  |
| Risk concentrated in               | Entire phase                       | Only 3E (the actual switch)          |

---

## 4. Dependency Graph

```
Subphase 3A (ext: auth provider)  ──────────┐
                                              ├──→ Subphase 3C (ext: sends idToken)
Subphase 3B (backend: optional JWT) ─────────┘            │
                                                           ├──→ Subphase 3E (backend: require auth + enforce)
Subphase 3D (ext: startup fix) ──── independent ──────────┘            │
                                                                        └──→ Subphase 3F (portal scoping + UI)
```

**Parallel opportunities:**

- 3A and 3B can be done in parallel (different repos, no interdependency)
- 3D can be done in parallel with 3A, 3B, or 3C (isolated to startup logic)
- 3F can be developed in parallel with 3E (same patterns, just portal endpoints)

---

## 5. Effort Estimate (Subphased)

| Subphase  | Environment | Effort         | Cumulative   |
| --------- | ----------- | -------------- | ------------ |
| 3A        | E           | 1–1.5 days     | 1–1.5 days   |
| 3B        | W           | 0.5–1 day      | 1.5–2.5 days |
| 3C        | E           | 1 day          | 2.5–3.5 days |
| 3D        | E           | 1–1.5 days     | 3.5–5 days   |
| 3E        | W           | 0.5–1 day      | 4–6 days     |
| 3F        | W           | 0.5–1 day      | 4.5–7 days   |
| **Total** |             | **4.5–7 days** |              |

Consistent with the original 5–7 day estimate, but with 6 independently verifiable checkpoints instead of 1.

---

## 6. Full E2E Validation (After 3F)

After all subphases are deployed, the full E2E validation from the original Gate 3b applies:

1. **UJ-1 (Solo activation):** Install VSIX → enter license key → Cognito sign-in → activation succeeds → `license.json` has userId → DynamoDB has userId
2. **UJ-2 (Multi-device):** Activate on two devices → portal shows both → deactivate one → portal shows one
3. **UJ-4 (Sleep/wake recovery):** Activate → close VS Code → wait 20 min → reopen → still LICENSED
4. **UJ-6 (Business device scoping):** User A activates Device 1, User B activates Device 2 (same license) → each sees only their own device in portal
5. **UJ-8 (Deactivation):** Deactivate from portal → device count decreases → can activate new device
6. **UJ-10 (Offline grace):** Activate → disconnect → close VS Code → wait 1 hour → reconnect → reopen → LICENSED (within 72h grace)
7. **Portal check:** `staging.hic-ai.com` → Devices page → user identity, per-seat usage, correct scoping

---

## 7. Recommendation

Adopt the 6-subphase approach. The additional coordination overhead (6 deploy cycles vs. 1) is trivially offset by:

- **Reduced debugging surface** — if something breaks, you know exactly which subphase introduced it
- **No "big bang" moment** — the scariest change (3E: require auth) happens after everything else is already proven working
- **Each subphase mirrors the Phases 0–2 pattern** — additive, testable, deployable independently
- **No Marketplace timing concern** — since Mouse is pre-Marketplace, we control exactly when the VSIX is updated, so 3C and 3E can even be deployed on the same day

**Next step:** If accepted, update `20260211_MULTI_SEAT_IMPLEMENTATION_PLAN_V2.md` and `PLG_ROADMAP_v7.md` to reflect the subphase structure.
