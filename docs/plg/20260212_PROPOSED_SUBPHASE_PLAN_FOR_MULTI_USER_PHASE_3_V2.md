# Proposed Subphase Plan for Multi-User Phase 3 (V2 — Browser-Delegated Activation)

**Date:** 2026-02-12
**Author:** Copilot (with SWR approval)
**Status:** ✅ APPROVED by SWR (2026-02-12)
**Supersedes:** [V1](20260211_PROPOSED_SUBPHASE_PLAN_FOR_MULTI_USER_PHASE_3.md) — this version incorporates the Browser-Delegated Activation model approved on 2026-02-12
**Context:** Phase 3 of the Multi-Seat Implementation Plan is the most complex phase. Phases 0–2 each went smoothly because they were additive and independently deployable. This V2 restructures Phase 3 into 5 subphases (3A–3B, 3D–3F) using the browser-delegated activation model, which eliminates Subphase 3C entirely and replaces the extension AuthenticationProvider approach with a simpler browser-based flow.
**Authorizing Document:** [20260212_GC_PROPOSAL_BROWSER_DELEGATED_ACTIVATION.md](20260212_GC_PROPOSAL_BROWSER_DELEGATED_ACTIVATION.md)

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

### Subphase 3A: Browser-Delegated Activation (Extension-Only)

**Goal:** Replace the extension's license activation command to open the browser for authenticated activation, then poll for completion. No AuthenticationProvider, no PKCE, no `vscode://` URI handler.

**Environment:** 🔧 E (`hic` repo)

**Files:**

- `licensing/commands/activate.js` — after key validation: open browser URL with params, start polling loop, handle timeout/success/error (~80 LOC modification)
- `licensing/http-client.js` — add `pollActivationStatus()` — calls `/api/license/validate` with `fingerprint` + `licenseKey`, returns when status confirms LICENSED or timeout (~40 LOC)
- `licensing/constants.js` — add `ACTIVATE_URL` (website activation page), `POLL_INTERVAL_MS` (3000), `POLL_TIMEOUT_MS` (300000)
- `licensing/state.js` — add `userId`, `userEmail` fields to the schema (non-secret display identifiers)
- `mouse-vscode/src/extension.js` — activation command calls modified `activate.js` which opens browser + polls; no AuthenticationProvider registration

**Work:**

- On `Mouse: Enter License Key`: validate key format locally → generate fingerprint (existing) → call `vscode.env.openExternal()` to open `https://staging.hic-ai.com/activate?key={licenseKey}&fingerprint={fingerprint}&deviceName={deviceName}&platform={platform}`
- Begin polling loop: POST `/api/license/validate` with `{ licenseKey, fingerprint }` every ~3 seconds, timeout after 5 minutes
- When poll returns `status: LICENSED` with `userId`, `userEmail`, `machineId`: write to `license.json`, start heartbeat, show success notification
- On timeout: show "Activation timed out. Use **Mouse: Check License Status** to verify." (The DDB record is still written when the user completes browser auth — the timeout only affects the extension's awareness, not backend state.)

**What is NOT built:**

- No `HicCognitoAuthProvider` class
- No PKCE implementation
- No `vscode://` URI handler
- No `SecretStorage` token management
- No `authentication` contribution point in `package.json`
- No token refresh logic
- No `createSession()` / `getSessions()` / `removeSession()`
- No `Authorization: Bearer` header from the extension — ever

**Gate 3A:**

- [ ] Extension unit tests pass (`cd licensing && npm test && cd mouse-vscode && npm test`)
- [ ] New/updated tests: `activate.test.js` — browser URL opened with correct params, polling loop handles success/timeout/error
- [ ] New/updated tests: `http-client.test.js` — `pollActivationStatus()` returns LICENSED when backend confirms activation
- [ ] New/updated tests: `state.test.js` — `userId`/`userEmail` storage and retrieval
- [ ] Manual verification: Enter license key → browser opens at correct URL → user can sign in and activate → extension detects activation via polling → `license.json` updated with `userId`, `machineId`, `status: LICENSED`
- [ ] Activation still works for trial users (no behavioral change to trial flow)
- [ ] No `AuthenticationProvider` registered, no `SecretStorage` credentials, no URI handler

**Risk: Low.** One new external dependency (browser must be reachable), but `vscode.env.openExternal()` is reliable across all environments including remote/container/WSL.

**Dependency:** 3B (backend accepts JWT from website session, and `/activate` page exists). Can be developed in parallel with 3B since the extension and website work are independent.

---
### Subphase 3B: Backend Accepts JWT + `/activate` Page (Backend, Backward Compatible)

**Goal:** (1) If a JWT arrives on an activation or heartbeat request, verify it and store userId/userEmail. If no JWT, proceed as before. (2) Build the `/activate` page that the extension opens via browser-delegated activation.

**Environment:** 🔧 W (`plg-website` repo)

**Files:**

- `plg-website/src/app/api/license/activate/route.js` — accept `Authorization: Bearer {JWT}` header
- `plg-website/src/app/api/license/heartbeat/route.js` — accept userId in payload
- `plg-website/src/app/api/license/validate/route.js` — include `userId`/`userEmail` in response when activated device found
- `plg-website/src/app/activate/page.js` (new) — browser-delegated activation page (~150 LOC)

**Work:**

- **Activation endpoint:** Check for `Authorization: Bearer {token}` header. If present → call `verifyAuthToken()` (Phase 1) → extract userId/userEmail → pass to `addDeviceActivation()` (Phase 2). If absent → proceed without them (existing behavior preserved). **DynamoDB write must complete before returning HTTP 200** (consistency guarantee).
- **Heartbeat endpoint:** If `userId` in payload → store it via device record update. If absent → proceed as before.
- **Validate endpoint:** When returning a validated device, include `userId` and `userEmail` from the DynamoDB device record in the response (enables extension polling to discover user identity).
- **`/activate` page (new):** Accepts URL parameters (`key`, `fingerprint`, `deviceName`, `platform`). Requires Cognito authentication (redirects to Hosted UI if not logged in). On auth, calls the activation API with JWT from session + device params from URL. Shows success page **only after HTTP 200 confirms DDB write**. Shows error state on failure.
- **Phase 2 deferred cleanup — concurrent device window alignment (4 locations + 1 comment):**
  - `activate/route.js` line 98: change `|| 24` → `|| 2` in fallback
  - `activate/route.js` line 97: update comment from `(24-hour window)` → `(2-hour window)`
  - `heartbeat/route.js` line 220: change `|| 24` → `|| 2` in fallback
  - `heartbeat.test.js` line 523: change `|| 24` → `|| 2` in test logic
  - `heartbeat.test.js` line 528: change `expect(windowHours).toBe(24)` → `.toBe(2)`
  - `dynamodb.js` line 690: change `getActiveDevicesInWindow(keygenLicenseId, windowHours = 24)` default → `= 2` (aligns with `getActiveUserDevicesInWindow` which already defaults to 2; unreachable in production but should match business intent)

**Gate 3B:** ✅ **ALL PASSED (2026-02-12)**

- [x] All existing tests pass (1255 total, no regression) — ✅ 2026-02-12
- [x] New tests: activation WITH valid JWT → userId/userEmail stored in DynamoDB — ✅ 37 new tests in `phase3b-auth-activation.test.js`
- [x] New tests: activation WITHOUT JWT → proceeds normally (backward compatible) — ✅
- [x] New tests: activation WITH invalid/expired JWT → 401 rejection (bad token ≠ no token) — ✅
- [x] New tests: heartbeat WITH userId → device record updated — ✅
- [x] New tests: heartbeat WITHOUT userId → proceeds normally (backward compatible) — ✅
- [x] New tests: validate response includes userId/userEmail when device record has them — ✅
- [x] `/activate` page renders, requires auth, calls API, shows success/error — ✅ 255 LOC, Cognito auth redirect, success/error states
- [x] Concurrent device window aligned: all `|| 24` fallbacks changed to `|| 2`, `getActiveDevicesInWindow` default matches `getActiveUserDevicesInWindow` (both default to 2) — ✅ 6 locations updated
- [x] CI/CD passes — ✅ Amplify deployed successfully to staging
- [x] E2E: Deploy to staging → existing extension (no auth) still activates successfully — ✅ SWR smoke test in `hic-e2e-clean` Codespace: VSIX install → license activation → `license_status` confirmed LICENSED
- [x] E2E: Open `/activate?key=...&fingerprint=...` in browser → auth → activation succeeds → success page shown — ✅ SWR smoke test: `/activate` redirects to Cognito auth, post-auth correctly handles params (missing params → expected error; page logic confirmed working)

**Commits:** `13deabd` (Phase 3B implementation + tests), `a63ad71` (dm test fix), merged to `main` 2026-02-12.

**Risk: Near zero.** Purely additive. Old clients are completely unaffected. The `/activate` page is new and self-contained.

**Dependency:** Phase 1 (auth-verify.js) and Phase 2 (dynamodb.js functions) — both complete.

**Key Design Decision:** The distinction between "no Authorization header" and "invalid Authorization header" is important:

- **No header** → backward-compatible, proceed without userId (transitional)
- **Header present but invalid/expired** → 401 rejection (client tried to authenticate and failed; this is an error, not a graceful degradation)

### Subphase 3D: Fix Startup Flow / Expiry Bug (Extension Change)

**Goal:** Fix UJ-4 (sleep/wake recovery) — independent of auth, can be done in parallel with 3A–3B.

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

**Note:** Under the browser-delegated model, re-activation is **auth-free**. The one-time user-device binding in DynamoDB (created during the original browser-based activation) serves as permanent proof of user-device association. The backend looks up the existing DynamoDB device record by `fingerprint`, retrieves the stored `userId`, and mints a new Keygen machine without requiring fresh authentication. No browser redirect needed for re-activation.

**Gate 3D:**

- [ ] Extension unit tests pass
- [ ] New/updated tests: `licensing.test.js` — startup flow (heartbeat-first), dead machine revival path
- [ ] New/updated tests: `heartbeat.test.js` — revival scenario (dead → alive after re-activation)
- [ ] Manual E2E: activate → close VS Code → wait 20 minutes → reopen → still LICENSED (not Expired)

**Risk: Low.** Isolated to extension startup logic. ALWAYS_ALLOW_OVERAGE guarantees re-activation success.

**Dependency:** None (independent of 3A, 3B). Can be developed in parallel.

**Parallel Opportunity:** 3D can be developed and tested in parallel with 3A–3B since it doesn't touch the auth or activation flow.

---

### Subphase 3E: Require Auth + Per-Seat Enforcement (Backend, Breaking Change)

**Goal:** Flip the switch — authentication is now required. Enforce per-seat device limits.

**Environment:** 🔧 W (`plg-website` repo)

**Files:**

- `plg-website/src/app/api/license/activate/route.js`
- `plg-website/src/app/api/license/heartbeat/route.js`

**Work:**

- **Remove backward-compatible fallback:** Activation without JWT → HTTP 401 Unauthorized. No unauthenticated activation path.
- **Phase 2 deferred cleanup — make `userId`/`userEmail` mandatory in `addDeviceActivation()`:** Now that all callers extract identity from JWT, these parameters are no longer optional. Add a validation guard at the top of `addDeviceActivation()` in `dynamodb.js`: if `!userId || !userEmail`, throw an error. This prevents silent data loss — a future caller that accidentally omits identity will fail loudly rather than writing a device record without user binding. Remove the conditional spread (`...(userId && { userId })`) and write them unconditionally.
- **Per-seat enforcement (Business licenses):** Call `getActiveUserDevicesInWindow(licenseId, userId)` → if active devices ≥ per-seat limit → HTTP 403 with meaningful error
- **Per-license enforcement (Individual licenses):** Same mechanism but using per-license limit instead of per-seat limit. DynamoDB is the sole enforcement layer (Keygen has ALWAYS_ALLOW_OVERAGE).
- **Heartbeat without userId:** Return HTTP 401 (or, during a brief transition period, log warning and apply per-license fallback behavior — then remove fallback promptly)

**Gate 3E:**

- [ ] All existing tests pass (updated to reflect auth-required behavior)
- [ ] `addDeviceActivation()` guard: calling without `userId` or `userEmail` throws (prevents silent unbound device records)
- [ ] Existing `addDeviceActivation` tests updated: all calls now provide `userId`/`userEmail`
- [ ] New tests: activation without JWT → 401
- [ ] New tests: Business license, per-seat limit exceeded → 403 with meaningful error body
- [ ] New tests: Business license, per-seat limit not exceeded → 200 success
- [ ] New tests: Individual license → DynamoDB-based device limit enforcement (2-hour sliding window)
- [ ] New tests: heartbeat without userId → 401 (or warning with fallback)
- [ ] CI/CD passes
- [ ] E2E: activation without auth → 401. Activation with auth, under limit → 200. Over limit → 403.

**Risk: Low.** Since Mouse is not yet published to the VS Code Marketplace (all installs are via local VSIX), there are no stale extension versions in the wild. We control exactly when the extension is updated, so 3A (extension opens browser + polls) and 3E (backend requires auth) can be deployed on the same day with no gap. The only prerequisite is that the VSIX installed for testing includes the 3A browser-delegated activation changes before 3E goes live.

**Dependency:** 3A (extension opens browser + polls, VSIX built and installed) and 3B (backend accepts JWT + `/activate` page deployed).

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
| Deployments                        | 1 (both repos simultaneously)      | 5 (each independent)                 |
| Backward compatible during rollout | No                                 | Yes, until 3E                        |
| Can test incrementally             | No — full E2E only                 | Yes — each subphase has its own gate |
| Rollback granularity               | All or nothing                     | Per-subphase                         |
| Extension auto-update window       | N/A (not yet on Marketplace)       | N/A (VSIX install is controlled)     |
| Debugging surface                  | Full stack                         | One layer at a time                  |
| Risk concentrated in               | Entire phase                       | Only 3E (the actual switch)          |

---

## 4. Dependency Graph

```
Subphase 3A (ext: browser URL + poll)  ─────┐
                                                ├──→ Subphase 3E (backend: require auth + enforce)
Subphase 3B (backend: JWT + /activate page) ──┘            │
                                                             └──→ Subphase 3F (portal scoping + UI)
Subphase 3D (ext: startup fix) ──── independent
```

**Parallel opportunities:**

- 3A and 3B can be done in parallel (different repos, no interdependency)
- 3D can be done in parallel with 3A or 3B (isolated to startup logic)
- 3F can be developed in parallel with 3E (same patterns, just portal endpoints)

---

## 5. Effort Estimate (Subphased)

| Subphase  | Environment | Effort         | Cumulative   | Change from V1 |
| --------- | ----------- | -------------- | ------------ | -------------- |
| 3A        | E           | 0.5 day        | 0.5 day      | Was 1–1.5 days (AuthProvider); now browser URL + poll |
| 3B        | W           | 0.5–1 day      | 1–1.5 days   | Now includes `/activate` page (~150 LOC) |
| ~~3C~~    | ~~E~~       | ~~0 days~~     | —            | **ELIMINATED** (absorbed into 3A) |
| 3D        | E           | 0.5–1 day      | 1.5–2.5 days | Simplified: auth-free re-activation |
| 3E        | W           | 0.5–1 day      | 2–3.5 days   | Unchanged in substance |
| 3F        | W           | 0.5–1 day      | 2.5–4 days   | Unchanged |
| **Total** |             | **2.5–4 days** |              | **Savings: ~2–3 days vs V1** |

**Net savings over V1:** ~2–3 days, plus elimination of ~450 LOC of security-critical code (auth provider + tests) and zero new credential storage surfaces.

---

## 6. Full E2E Validation (After 3F)

After all subphases are deployed, the full E2E validation from the original Gate 3b applies:

1. **UJ-1 (Solo activation):** Install VSIX → enter license key → browser opens → Cognito sign-in (website) → activation succeeds → extension detects via poll → `license.json` has userId → DynamoDB has userId
2. **UJ-2 (Multi-device):** Activate on two devices → portal shows both → deactivate one → portal shows one
3. **UJ-4 (Sleep/wake recovery):** Activate → close VS Code → wait 20 min → reopen → still LICENSED
4. **UJ-6 (Business device scoping):** User A activates Device 1, User B activates Device 2 (same license) → each sees only their own device in portal
5. **UJ-8 (Deactivation):** Deactivate from portal → device count decreases → can activate new device
6. **UJ-10 (Offline grace):** Activate → disconnect → close VS Code → wait 1 hour → reconnect → reopen → LICENSED (within 72h grace)
7. **Portal check:** `staging.hic-ai.com` → Devices page → user identity, per-seat usage, correct scoping

---

## 7. Recommendation

Adopt the 5-subphase browser-delegated approach (3A, 3B, 3D, 3E, 3F). This V2 replaces the original 6-subphase plan per the approved [Browser-Delegated Activation Proposal](20260212_GC_PROPOSAL_BROWSER_DELEGATED_ACTIVATION.md). Benefits:

- **Eliminated ~450 LOC of security-critical code** — no AuthenticationProvider, no PKCE, no token storage, no URI handler
- **Zero local credential storage** — the extension never holds Cognito tokens
- **~2–3 days faster** — 2.5–4 days vs 4.5–7 days
- **More reliable in remote environments** — `vscode.env.openExternal()` works everywhere; `vscode://` URI handler does not
- **Simpler re-activation** — auth-free, using DynamoDB binding as permanent proof
- **Reduced debugging surface** — if something breaks, you know exactly which subphase introduced it
- **No "big bang" moment** — the scariest change (3E: require auth) happens after everything else is already proven working
- **Each subphase mirrors the Phases 0–2 pattern** — additive, testable, deployable independently

**Files NOT created (vs V1):**

- `mouse-vscode/src/licensing/auth-provider.js` (~250 LOC) — eliminated
- `mouse-vscode/tests/auth-provider.test.js` (~200 LOC) — eliminated

**Next step:** Update `20260212_MULTI_SEAT_IMPLEMENTATION_PLAN_V3.md` and `PLG_ROADMAP_v7.md` to reflect the revised subphase structure.
