# Multi-Seat Device Management: Implementation Plan (V3)

**Date:** 2026-02-12
**Author:** GC (Copilot)
**Status:** FINAL — Approved for Implementation
**Supersedes:** [V2](20260211_MULTI_SEAT_IMPLEMENTATION_PLAN_V2.md) — this version incorporates the Browser-Delegated Activation model approved on 2026-02-12
**Revision (2026-02-12):** Phase 3 restructured per the approved [Browser-Delegated Activation Proposal](20260212_GC_PROPOSAL_BROWSER_DELEGATED_ACTIVATION.md). Key changes: Subphase 3A replaced (AuthProvider → browser URL + poll), Subphase 3C eliminated (absorbed into 3A), Subphase 3D simplified (auth-free re-activation). Phase 3 reduced from 6 to 5 subphases and from 4.5–7 days to 2.5–4 days. All prior revisions from V2 (phase resequencing per SWR direction) are retained.
**Prerequisites:** All decisions resolved (D1 through D3). D3 is no longer relevant (no `vscode://` callback needed). Ready for implementation.
**Reference Documents:**

- [20260210_GC_TECH_SPEC_MULTI_SEAT_DEVICE_MANAGEMENT.md](20260210_GC_TECH_SPEC_MULTI_SEAT_DEVICE_MANAGEMENT.md) — Original specification (Section 3.5 AuthenticationProvider approach superseded by browser-delegated model)
- [20260212_GC_PROPOSAL_BROWSER_DELEGATED_ACTIVATION.md](20260212_GC_PROPOSAL_BROWSER_DELEGATED_ACTIVATION.md) — **Browser-Delegated Activation Proposal (approved)**
- [20260212_PROPOSED_SUBPHASE_PLAN_FOR_MULTI_USER_PHASE_3_V2.md](20260212_PROPOSED_SUBPHASE_PLAN_FOR_MULTI_USER_PHASE_3_V2.md) — **Revised subphase plan (V2, browser-delegated)**
- [20260211_ADDENDUM_TO_MULTI_SEAT_DEVICE_MANAGEMENT_SPECIFICATION_V2.md](20260211_ADDENDUM_TO_MULTI_SEAT_DEVICE_MANAGEMENT_SPECIFICATION_V2.md) — Infrastructure audit & recommendations (v2)
- [20260211_REPORT_ON_KEYGEN_INVESTIGATION.md](20260211_REPORT_ON_KEYGEN_INVESTIGATION.md) — Keygen API findings & PER_LICENSE vs PER_USER analysis
- [20260212_ADDENDUM_TO_KEYGEN_INVESTIGATION_RE_VALIDATION_CODES.md](20260212_ADDENDUM_TO_KEYGEN_INVESTIGATION_RE_VALIDATION_CODES.md) — Keygen validation codes, extension-side data flow trace (identifies httpClient information loss affecting 3D)


> **Reading Order:** This Implementation Plan V3 is the **definitive, self-sufficient** document for all phasing, task ordering, and implementation decisions. The companion Tech Spec (20260210) provides architectural context and rationale but its phasing structure and authentication approach (AuthenticationProvider + PKCE) are **superseded** by this document and the Browser-Delegated Activation Proposal. The Addendum V2 and Keygen Investigation Report are reference material. When in doubt, this document governs.

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
| D1  | Change heartbeat strategy to KEEP_DEAD + ALWAYS_REVIVE?            | **A:** Yes **B:** No, retain DEACTIVATE_DEAD + NO_REVIVE and build re-activation | **RESOLVED: B** — DEACTIVATE_DEAD retained; extension handles transparent re-activation. With ALWAYS_ALLOW_OVERAGE, re-activation always succeeds. |
| D2  | Extend `heartbeatDuration` from 900s to 3600s?                     | **A:** Yes **B:** Keep 900s                                                   | **RESOLVED: A** — heartbeatDuration extended to 3600s (1 hour). Reduces machine deletion churn during normal laptop sleep. |
| D3  | Add `vscode://` callback to existing App Client or create new one? | **A:** Existing (recommended) **B:** New client                               | **RESOLVED: A** — Add `vscode://hic-ai.mouse/callback` to the existing `mouse-staging-web` App Client. Same JWT verifier config, no new env vars needed. |

> **Resolved:** Individual `maxMachines` is **3**. This was a prior business decision reflected in `plg-website/src/lib/constants.js` (`maxConcurrentMachines: 3`) and throughout the implementation. The Keygen Individual policy currently has `maxMachines: 2`, which is incorrect and will be corrected in Phase 0, Step 0.2. Note: with `ALWAYS_ALLOW_OVERAGE`, `maxMachines` is decorative (dashboard visibility only) — Keygen does not enforce it.

> **Resolved: Concurrency Model.** Concurrency is defined by a **2-hour sliding window** in DynamoDB: devices whose `lastHeartbeat > now - 2 hours` count as concurrent (controlled by `CONCURRENT_DEVICE_WINDOW_HOURS` env var, default: 2). Keygen's `maxMachines` is decorative under `ALWAYS_ALLOW_OVERAGE` and does not participate in enforcement. Answers to sub-questions: (1) When a container stops, its slot frees automatically after the 2-hour window expires — no manual deactivation needed. Under DEACTIVATE_DEAD, Keygen also auto-cleans the machine record after `heartbeatDuration` (1 hour, per D2 resolution). (2) Keygen's heartbeat lifecycle is orthogonal to enforcement — DEACTIVATE_DEAD provides operational hygiene (auto-cleanup) while DynamoDB provides concurrency enforcement. (3) A developer who overuses on Day One can use Mouse normally after their excess devices’ `lastHeartbeat` ages past the 2-hour window.

> **⚠️ IMPLEMENTATION AUDIT REQUIRED: Concurrent Device Window.** The `CONCURRENT_DEVICE_WINDOW_HOURS` value was changed from 24 hours to **2 hours** as a business decision on 2026-02-11. The codebase may still reference the old 24-hour default in various places. During implementation and testing, **audit all references** to `CONCURRENT_DEVICE_WINDOW_HOURS`, the 24-hour window, or any hardcoded time-window values to ensure the 2-hour sliding-window strategy is adopted uniformly across the activation route, heartbeat route, DynamoDB query functions, portal device display, and any constants files. This is a cross-cutting concern that touches both repos.

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
| **UJ-6**  | Business device scoping | Team member sees only their own devices in portal, not other team members'               | Phase 3    |
| **UJ-7**  | Seat limit enforcement  | Business license with 2 seats, 3rd user tries to activate, gets "contact admin" message  | Phase 3    |
| **UJ-8**  | Device deactivation     | User deactivates a device from portal, freeing a slot for a new device                   | Phase 3    |
| **UJ-9**  | Heartbeat with identity | Server resolves userId from DDB device record on each heartbeat; per-user device activity tracked without extension transmitting identity data (revised per [Auth Strategy Update](20260212_UPDATE_RE_AUTH_STRATEGY_AND_LOCAL_DATA.md), Decision 1) | Phase 3    |
| **UJ-10** | Offline grace           | User is offline for 48 hours, Mouse still works using cached validation                  | All phases |

---

## 4. Implementation Phases

### Legend

- ✅ **Gate:** A testing/validation checkpoint that must pass before proceeding
- 🔧 **Environment:** Which system is being modified
- 📋 **Tests:** What tests must be written or pass
- 🔍 **E2E Assessment:** Whether end-to-end validation is practicable at this point

---

### Phase 0: Keygen Policy Configuration (Pre-Work) — ✅ COMPLETED 2026-02-11

**Goal:** Align Keygen's actual policy settings with the code's assumptions and fix the root cause of the license expiry bug. No code changes. All changes are to the Keygen service configuration via API.

**Status:** ✅ **COMPLETED** — All policy changes applied and verified via scripted Gate 0 checks. E2E smoke test passed by SWR in `hic-e2e-clean` Codespace (fresh Mouse install → trial → license activation → confirmed LICENSED via `license_status`).

**Environment:** 🔧 K (Keygen API)

#### Step 0.1: Verify Heartbeat Strategy (Both Policies)

The current DEACTIVATE_DEAD + NO_REVIVE configuration is being **retained**. No API call needed — simply verify the current settings are correct:

- `heartbeatCullStrategy: "DEACTIVATE_DEAD"` on both policies
- `heartbeatResurrectionStrategy: "NO_REVIVE"` on both policies

The extension will handle transparent re-activation for machines deleted after heartbeat expiry (see Step 3.3).

Targets:

- Individual: `91f1947e-0730-48f9-b19a-eb8016ae2f84`
- Business: `b0bcab98-6693-4c44-ad0d-ee3dbb069aea`

#### Step 0.4: Set overageStrategy to ALWAYS_ALLOW_OVERAGE (Both Policies)

This is the keystone configuration change. Execute two API calls:

```
PATCH /v1/accounts/{accountId}/policies/{policyId}
Authorization: Bearer {productToken}
Content-Type: application/vnd.api+json

{
  "data": {
    "type": "policies",
    "attributes": {
      "overageStrategy": "ALWAYS_ALLOW_OVERAGE"
    }
  }
}
```

Apply to both Individual and Business policies. This decouples Keygen from concurrency enforcement — Keygen becomes a machine registry and heartbeat tracker only. All device limit enforcement moves to DynamoDB's 2-hour sliding window.

#### Step 0.2: Correct maxMachines on Individual Policy (2 → 3)

The Individual policy currently has `maxMachines: 2`, which is incorrect. The business decision is 3 concurrent devices for Individual licenses, as reflected in `plg-website/src/lib/constants.js` (`PRICING.INDIVIDUAL.maxConcurrentMachines: 3`). With `ALWAYS_ALLOW_OVERAGE` this value is decorative (dashboard visibility only), but it should be accurate. Correct this now:

```
PATCH /v1/accounts/{accountId}/policies/91f1947e-0730-48f9-b19a-eb8016ae2f84
Authorization: Bearer {productToken}
Content-Type: application/vnd.api+json

{ "data": { "type": "policies", "attributes": { "maxMachines": 3 } } }
```

#### Step 0.3: Extend heartbeatDuration to 3600s (1 Hour)

**RESOLVED (D2 = A).** Execute two API calls (one per policy):

```
PATCH /v1/accounts/{accountId}/policies/{policyId}
{ "data": { "type": "policies", "attributes": { "heartbeatDuration": 3600 } } }
```

Apply to both Individual and Business policies. This extends the heartbeat window from 15 minutes to 1 hour, significantly reducing machine deletion churn during normal laptop sleep/idle cycles. The extension's 10-minute heartbeat interval now has a 50-minute buffer instead of a 5-minute buffer.

> **Note on heartbeat duration vs. concurrency window interaction (clarification for item g):** With `heartbeatDuration: 3600` (1 hour), Keygen deletes a dead machine after 1 hour of no heartbeats. The DynamoDB concurrency window is 2 hours. This means a machine can be dead on Keygen (deleted after 1 hour) while still counting as "concurrent" in DynamoDB for up to 1 additional hour. This is by design — the DynamoDB window intentionally prevents rapid slot-recycling regardless of Keygen's machine lifecycle. The 1-hour heartbeat duration provides a comfortable buffer for laptop sleep without requiring re-activation for any idle period under 1 hour, while the 2-hour concurrency window prevents abuse via rapid container cycling.

#### ✅ Gate 0: Verify Keygen Policy State

**Validation:** Re-query both policies via the API and confirm:

- [x] `heartbeatCullStrategy: "DEACTIVATE_DEAD"` on both (retained, not changed) — ✅ verified 2026-02-11
- [x] `heartbeatResurrectionStrategy: "NO_REVIVE"` on both (retained, not changed) — ✅ verified 2026-02-11
- [x] `overageStrategy: "ALWAYS_ALLOW_OVERAGE"` on both (changed from NO_OVERAGE) — ✅ verified 2026-02-11
- [x] `strict: false` on both (must remain false for ALWAYS_ALLOW_OVERAGE to work) — ✅ verified 2026-02-11
- [x] `maxMachines: 3` on Individual policy (corrected from 2) — ✅ verified 2026-02-11
- [x] `maxMachines: 5` on Business policy (unchanged) — ✅ verified 2026-02-11
- [x] `heartbeatDuration: 3600` on both (extended from 900) — ✅ verified 2026-02-11
- [x] All other attributes unchanged — ✅ verified via PATCH response inspection (each PATCH returned full policy with only targeted attribute changed)

**🔍 E2E Assessment:** The expiry bug (UJ-4) is **not** mitigated by Phase 0 alone — DEACTIVATE_DEAD is retained, so machines are still deleted after heartbeat expiry. Full UJ-4 resolution requires Phase 3 extension changes (transparent re-activation). Phase 0 enables this by ensuring `ALWAYS_ALLOW_OVERAGE` so re-activation will always succeed.

**Manual smoke test:** ✅ **PASSED (SWR, 2026-02-11).** SWR performed a full E2E validation in the `hic-e2e-clean` GitHub Codespace: installed Mouse as a VS Code extension from VSIX, initialized the workspace, confirmed trial mode via `license_status` (using GC-Raptor), then activated with an existing license key via `Mouse: Enter License Key`. GC-Raptor confirmed `license_status` returned LICENSED. This validates the complete E2E relay with Keygen post-policy-change — no regressions, no 422 errors, activation flow works correctly.

**Expected system state after Phase 0:** ✅ **CONFIRMED**

- ✅ `overageStrategy: ALWAYS_ALLOW_OVERAGE` on both policies (Keygen never blocks activations)
- ✅ `maxMachines: 3` on Individual (corrected from 2, decorative)
- ✅ `strict: false` confirmed on both (required for ALWAYS_ALLOW_OVERAGE)
- ✅ DEACTIVATE_DEAD + NO_REVIVE retained (extension handles re-activation in Phase 3)
- ✅ `heartbeatDuration: 3600` on both (extended from 900, reduces machine deletion churn)
- License expiry bug is NOT yet mitigated — requires Phase 3 extension changes
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
- [x] Specifically: `__tests__/unit/api/portal.test.js` passes (portal routes) — ✅
- [x] Specifically: `__tests__/unit/lib/auth.test.js` passes — ✅

**📋 New tests to write:**

- [x] `__tests__/unit/lib/auth-verify.test.js` — 46 tests covering Bearer parsing, verifier init, decision tree, route wrapper contracts, source code verification across all 14 route files — ✅ 2026-02-11
- [x] New tests pass — ✅ 1198/1198 total (31 test files)

**📋 CI/CD:**

- [x] Committed directly to `development`, pushed, CI passed — ✅ 2026-02-11
- [x] CI pipeline passes — ✅ Merged to `main` (commit 1e3011c)

**🔍 E2E Assessment:** Yes — practicable and recommended. Log into the portal at `https://staging.hic-ai.com`, navigate to each protected page (devices, settings, team, etc.) and confirm they still load correctly. This validates the auth extraction didn't break anything.

**Expected system state after Phase 1:**

- ~~Cognito accepts `vscode://` callbacks (unblocks extension OAuth in Phase 3)~~ — **Vestigial under browser-delegated model.** The `vscode://hic-ai.mouse/callback` URL added to Cognito in Step 1.1 is no longer needed. It is harmless (an unused registered callback URL has no security impact) but should be removed in Phase 4 for hygiene. See Step 4.3.
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

Extend the function to accept `userId` and `userEmail` parameters. These are stored in the DynamoDB device record when provided.

```javascript
// Before: addDeviceActivation(keygenLicenseId, keygenMachineId, fingerprint, name, platform, metadata)
// After:  addDeviceActivation(keygenLicenseId, keygenMachineId, fingerprint, name, platform, metadata, userId, userEmail)
```

The DynamoDB item gains two new attributes:

- `userId` — Cognito sub (stable unique identifier)
- `userEmail` — human-readable, for display

> **⚠️ Implementation Note (2026-02-11, updated 2026-02-12):** `userId` and `userEmail` are added as **optional** parameters in Phase 2. The only production caller (`license/activate/route.js`) does not yet pass these values — that wiring happens in Phase 3 when the activation endpoint requires JWT authentication. Making them required now would break the existing unauthenticated activation flow.
>
> **Scheduled resolution:** In **Subphase 3B**, the activate route starts passing userId/userEmail when a JWT is present (optional path). In **Subphase 3E** (the "flip the switch" subphase), a validation guard is added to `addDeviceActivation()`: if `!userId || !userEmail`, throw. This prevents silent data loss — any future caller that accidentally omits identity will fail loudly rather than writing a device record without user binding. The conditional spread (`...(userId && { userId })`) is replaced with unconditional writes. See Subphase Plan V2, Subphase 3E for details.

#### Step 2.2: Add `getUserDevices()` Function

**File:** `plg-website/src/lib/dynamodb.js`

New function: given a `keygenLicenseId` and `userId`, return only that user's device records within the license partition.

#### Step 2.3: Add `getActiveUserDevicesInWindow()` Function

**File:** `plg-website/src/lib/dynamodb.js`

New function: combines the user filter with the time-window filter (2 hours, controlled by `CONCURRENT_DEVICE_WINDOW_HOURS` env var) to return only a specific user's concurrent devices.

> **⚠️ Implementation Note (2026-02-11, updated 2026-02-12): Concurrent Device Window Defaults.**
>
> - The **new** `getActiveUserDevicesInWindow()` defaults to **2 hours**, matching the agreed business decision.
> - The **existing** `getActiveDevicesInWindow()` retains its **24-hour** default. However, this default is effectively unused — both production callers (`license/activate/route.js` and `license/heartbeat/route.js`) compute the window explicitly via `parseInt(process.env.CONCURRENT_DEVICE_WINDOW_HOURS) || 24` and pass it as a parameter. The function's default value is never reached.
> - **Scheduled resolution (Subphase 3B):** All 4 locations + 1 comment are updated in Subphase 3B when these routes are already being modified for JWT acceptance:
>   - `activate/route.js` line 98: `|| 24` → `|| 2`; line 97: comment update
>   - `heartbeat/route.js` line 220: `|| 24` → `|| 2`
>   - `heartbeat.test.js` lines 523/528: test logic and assertion updated
>   - `dynamodb.js` line 690: `getActiveDevicesInWindow` function default changed from 24 → 2 (aligns with `getActiveUserDevicesInWindow`)
> - See Subphase Plan V2, Subphase 3B for the complete checklist.

#### Step 2.4: Consider GSI for User-Based Queries

Evaluate whether a GSI on `userId` is needed for efficient queries. Currently, device records use `PK: LICENSE#{id}, SK: DEVICE#{machineId}`. A query within a license partition filtered by `userId` should be efficient enough for most cases (devices per license is small). Document the decision.

> **✅ Decision (2026-02-11): No GSI.** Partition-level filtering is sufficient. Mouse licenses support 1–5 seats; even at 10 seats × 3 devices = 30 items per partition, in-memory filtering is negligible cost. Every call path (activation, heartbeat, portal) already has `keygenLicenseId` in context, so we never need a cross-license "all devices for user X" query. A GSI would add write replication cost, CloudFormation complexity, eventual consistency (vs. strong consistency for enforcement decisions), and wouldn't index pre-Phase 2 device records that lack `userId`. **Revisit trigger:** if we need a cross-license admin dashboard query ("show all of user X's devices across their org").

#### ✅ Gate 2: DynamoDB Functions Tested

**📋 Tests to run:**

```bash
cd plg-website && npm run test:lib
```

- [x] All existing `__tests__/unit/lib/dynamodb.test.js` tests pass (no regression)
- [x] Existing `addDeviceActivation` tests still pass (updated to require userId/userEmail)

**📋 New tests to write (in `dynamodb.test.js`):**

- [x] `addDeviceActivation` with userId/userEmail — verify DynamoDB PutItem includes new attributes
- [x] `addDeviceActivation` without userId/userEmail — verify it succeeds without them (optional in Phase 2; Phase 3 makes mandatory)
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
- Existing device query operations are unchanged
- New functions are available and ready for Phase 3 wiring
- Extension still works exactly as before (trial mode unaffected)

---

### Phase 3: Authenticated Activation, Per-Seat Enforcement & Portal Alignment (Backend + Extension + Frontend)

**Goal:** Wire up browser-delegated activation, make the activation endpoint require and verify identity via JWT from the website session, enforce per-seat device limits, fix the startup flow, and align the portal UI with the new per-user device model.

**Environment:** 🔧 E (hic) + 🔧 W (plg-website), interleaved

> **📄 Detailed Plan:** Phase 3 is broken into 5 independently deployable subphases (3A, 3B, 3D, 3E, 3F) using the browser-delegated activation model. Subphase 3C has been eliminated. See [20260212_PROPOSED_SUBPHASE_PLAN_FOR_MULTI_USER_PHASE_3_V2.md](20260212_PROPOSED_SUBPHASE_PLAN_FOR_MULTI_USER_PHASE_3_V2.md) for the full subphase plan with per-subphase gates, dependency graph, and effort estimates.

#### Subphase Summary

| Subphase | Focus | Env | Risk | Key Change |
|----------|-------|-----|------|------------|
| **3A** | Browser-delegated activation | E | Low | ✅ **COMPLETE (2026-02-13)** — Extension opens browser for auth + polls for completion. AuthStrategy injection pattern, `pollActivationStatus()`, 48 new tests. No AuthenticationProvider, no PKCE, no URI handler. |
| **3B** | Backend accepts JWT + `/activate` page | W | Near zero | ✅ **COMPLETE (2026-02-12)** — If JWT present → verify + store userId. `/activate` page handles browser-side auth flow. Backward compatible. All 12 gate criteria passed. |
| ~~3C~~ | ~~Eliminated~~ | — | — | Absorbed into revised 3A. Extension never sends tokens. |
| **3D** | Fix startup flow / expiry bug | E | Low | ✅ **COMPLETE (2026-02-13)** — Heartbeat-first startup, machine recovery codes, `_attemptMachineRevival()`, enriched `validateLicense()` return. 6 new heartbeat tests. |
| **3E** | Require auth + per-seat enforcement | W | Low | ✅ **COMPLETE (2026-02-13)** — JWT required on `/activate` page, per-seat limits enforced, `addDeviceActivation()` userId/userEmail guard added. Full E2E validated by SWR in `hic-e2e-clean` Codespace: Mouse VSIX install → trial → license activation → LICENSED confirmation. All code changes implemented, tested, pushed to `development`. |
| **3F** | Portal scoping + UI | W | Low | Scope devices to current user. Fix DELETE authorization. UI copy updates. |

#### Subphase Dependencies

```
3A (ext: browser URL + poll)  ─────┐
                                       ├──→ 3E (backend: require auth + enforce)
3B (backend: JWT + /activate page) ──┘            │
                                                    └──→ 3F (portal scoping + UI)
3D (ext: startup fix) ──── independent
```

**Parallel opportunities:** 3A and 3B can be done in parallel (different repos). 3D can be done in parallel with 3A–3B (isolated to startup logic).

> **Pre-Marketplace note:** Mouse has not yet been published to the VS Code Marketplace. All testing uses locally-built VSIX files. This eliminates any concern about auto-update windows or stale extension versions.

#### ✅ Gate 3 (after all subphases): Full E2E Validation

After all 5 subphases are complete, the following E2E validation applies:

1. **UJ-1 (Solo activation):** Install VSIX → enter license key → browser opens → Cognito sign-in (website) → activation succeeds → extension detects via poll → `license.json` has `machineId` + `status: LICENSED` (no `userId` — per [Auth Strategy Update](20260212_UPDATE_RE_AUTH_STRATEGY_AND_LOCAL_DATA.md), Decision 1) → DynamoDB has userId
2. **UJ-2 (Multi-device):** Activate on two devices → portal shows both → deactivate one → portal shows one
3. **UJ-4 (Sleep/wake recovery):** Activate → close VS Code → wait 20 min → reopen → still LICENSED
4. **UJ-6 (Business device scoping):** User A activates Device 1, User B activates Device 2 (same license) → each sees only their own device in portal
5. **UJ-8 (Deactivation):** Deactivate from portal → device count decreases → can activate new device
6. **UJ-10 (Offline grace):** Activate → disconnect → close VS Code → wait 1 hour → reconnect → reopen → LICENSED (within 72h grace)
7. **Portal check:** `staging.hic-ai.com` → Devices page → user identity, per-seat usage, correct scoping

See the [subphase plan](20260212_PROPOSED_SUBPHASE_PLAN_FOR_MULTI_USER_PHASE_3_V2.md) for per-subphase gates (3A, 3B, 3D, 3E, 3F).

**Expected system state after Phase 3:**

- Extension opens browser for authenticated activation; browser handles OAuth via website session
- Backend verifies JWT and stores per-user device records
- Per-seat enforcement blocks over-limit Business activations with meaningful errors
- Heartbeat payload unchanged; backend resolves userId from DDB device record for per-user tracking (per [Auth Strategy Update](20260212_UPDATE_RE_AUTH_STRATEGY_AND_LOCAL_DATA.md), Decision 1)
- Sleep/wake recovery works without user intervention
- All activations require authentication — unauthenticated activation returns HTTP 401
- Portal shows per-user device views for Business licenses
- Device deactivation works end-to-end from portal
- Business team members see only their own installations
- All unit tests pass in both repos
- All user journeys UJ-1 through UJ-10 are operational
- E2E validated against staging

---

### Phase 4: Hardening & Status Code Alignment (Backend)

**Goal:** Align status codes between backend and extension, and optionally sync Keygen's `maxMachines` for dashboard visibility.

**Environment:** 🔧 W (plg-website)

#### Step 4.1: (Optional) Sync `maxMachines` for Dashboard Visibility

**File:** `plg-website/src/lib/keygen.js`

With `ALWAYS_ALLOW_OVERAGE`, Keygen's `maxMachines` is decorative — it does not enforce device limits. However, keeping it accurate provides useful dashboard visibility.

When creating a Business license via `createLicense()`:

- Optionally set per-license `maxMachines = seats × PRICING.BUSINESS.maxConcurrentMachinesPerSeat`

When seats change (add/remove via portal):

- Optionally update the license's `maxMachines` via Keygen API

This step is **nice-to-have**, not enforcement-critical. Can be deferred if time is constrained.

#### Step 4.2: Fix Status Code Alignment

Ensure the heartbeat status codes are consistent between backend and extension:

- **Backend:** uses a defined set of status strings
- **Extension:** `VALID_HEARTBEAT_STATUSES` matches exactly
- Document the contract

#### Step 4.3: Remove Vestigial `vscode://` Callback URL from Cognito

**Environment:** 🔧 A (AWS Cognito)

Phase 1 (Step 1.1) added `vscode://hic-ai.mouse/callback` to the Cognito App Client's callback URLs. Under the browser-delegated activation model, this is no longer needed — the extension never uses a `vscode://` callback. The URL is harmless (Cognito validates redirects against the registered list, so an extra URL doesn’t weaken anything), but removing it is good hygiene and eliminates a minor audit finding.

```bash
# Remove vscode:// from callback URLs (preserve all other URLs)
aws cognito-idp update-user-pool-client \
  --user-pool-id us-east-1_CntYimcMm \
  --client-id 3jobildap1dobb5vfmiul47bvc \
  --callback-urls \
    "http://localhost:3000/auth/callback" \
    "https://staging.hic-ai.com/auth/callback" \
  --logout-urls \
    "http://localhost:3000" \
    "https://staging.hic-ai.com"
```

> **Note:** Verify the full list of existing callback/logout URLs via `aws cognito-idp describe-user-pool-client` before running the update, to ensure any Amplify preview URLs are preserved.

#### ✅ Gate 4: Hardening Tests Pass

**📋 New tests:**

- [ ] `keygen.test.js` — (optional) createLicense with Business policy sets per-license maxMachines for dashboard visibility
- [ ] `keygen.test.js` — (optional) updateLicenseSeats updates maxMachines proportionally for dashboard visibility
- [ ] Activation at 100% capacity (DynamoDB 2-hour sliding window) → HTTP 403 + meaningful error message
- [ ] Heartbeat status codes match extension's expected set
- [ ] `vscode://hic-ai.mouse/callback` removed from Cognito App Client callback URLs
- [ ] Existing portal login still works after callback URL update (regression check)
- [ ] All tests pass, CI passes

**🔍 E2E Assessment:** Yes — validate that a Business license with 2 seats enforces via DynamoDB's 2-hour sliding window. Activate 5 devices (same user, per-seat max) → all succeed. Attempt 6th → hard block (HTTP 403 from DynamoDB check, Keygen is never called). Verify portal login still works after Step 4.3 Cognito update.

**Expected system state after Phase 4:**

- (Optional) Keygen's `maxMachines` reflects seat count for dashboard visibility
- Hard device limit enforcement via DynamoDB 2-hour sliding window
- Status codes are aligned across all layers
- Vestigial `vscode://` callback URL removed from Cognito (Phase 1 cleanup)
- System is production-ready for multi-seat scenarios

---

## 5. Testing Strategy Summary

### Test Pyramid

| Level           | What                                              | Framework                                                | When                                   |
| --------------- | ------------------------------------------------- | -------------------------------------------------------- | -------------------------------------- |
| **Unit**        | Individual functions, classes, modules            | `node:test` + HIC helpers (W) / `node:test` + assert (E) | After every step                       |
| **Integration** | API route handlers with mocked dependencies       | `node:test` + mocked DynamoDB/Keygen                     | After steps that change route behavior |
| **E2E**         | Full user journeys against staging infrastructure | Manual + `test:e2e:journey` scripts (W)                  | At major gates (3b, 4)                 |
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
| ~~`mouse-vscode/src/licensing/auth-provider.js`~~    | ~~`mouse-vscode/tests/auth-provider.test.js`~~ (ELIMINATED — browser-delegated model) | ~~E~~ |
| `mouse-vscode/src/licensing/license-checker.js`      | `mouse-vscode/tests/licensing.test.js`           | E    |

### E2E Journey Tests (Existing)

The `__tests__/e2e/journeys/` directory already contains relevant journey tests:

- `j3-license-activation.test.js` — extend for authenticated activation
- `j4-multi-device.test.js` — extend for per-user scoping
- `j5-heartbeat-loop.test.js` — extend for per-user tracking (backend resolves userId from DDB; heartbeat payload unchanged per [Auth Strategy Update](20260212_UPDATE_RE_AUTH_STRATEGY_AND_LOCAL_DATA.md), Decision 1)
- `j6-concurrent-limits.test.js` — extend for per-seat enforcement

These should be updated as part of each phase's test expansion, not rewritten.

---

## 6. Dependency Graph

```
Phase 0 (Keygen config) ✅
    │
    ├──→ Phase 1 (Cognito + auth extract) ✅
    │
    ├──→ Phase 2 (DynamoDB functions) ✅
    │
    ├──→ Phase 3 (5 subphases — browser-delegated activation)
    │         │
    │         │    3A (ext: browser URL + poll)  ─────┐
    │         │                                         ├──→ 3E (require auth + enforce)
    │         │    3B (backend: JWT + /activate) ─────┘            │
    │         │                                                      └──→ 3F (portal + UI)
    │         │    3D (ext: startup fix) ──── independent
    │         │
    │         └──→ Phase 4 (Hardening + status alignment)
```

- Phase 0, Phase 1, and Phase 2 are all complete (different environments, no interdependencies)
- Phase 3 depends on Phase 0 (heartbeat strategy), Phase 1 (auth utility), AND Phase 2 (DynamoDB functions) — all satisfied
- Phase 3 is broken into 5 subphases (3A, 3B, 3D, 3E, 3F) using browser-delegated activation — see [subphase plan V2](20260212_PROPOSED_SUBPHASE_PLAN_FOR_MULTI_USER_PHASE_3_V2.md)
- Subphase 3C (extension sends idToken) has been **eliminated** — absorbed into revised 3A under the browser-delegated model
- Phase 3 includes Portal UI scoping so that E2E testing validates the full stack
- Phase 4 (hardening) depends on Phase 3

---

## 7. Effort Estimates

| Phase     | Environment | Effort            | Cumulative    |
| --------- | ----------- | ----------------- | ------------- |
| Phase 0   | K           | 0.5 day           | 0.5 day       | ✅ Done 2026-02-11 |
| Phase 1   | A + W       | 1 day             | 1.5 days      | ✅ Done 2026-02-11 |
| Phase 2   | W           | 1 day             | 2.5 days      | ✅ Done 2026-02-11 |
| Phase 3   | E + W       | 2.5–4 days        | 5–6.5 days    | 🟡 3A ✅ 2026-02-13, 3B ✅ 2026-02-12, 3D ✅ 2026-02-13, 3E ✅ 2026-02-13; 3F remaining |
| Phase 4   | W           | 1–2 days          | 6–8.5 days    |
| **Total** |             | **6–8.5 days**    |               |

Phase 3 is the critical path but is now decomposed into 5 independently deployable subphases, each with its own gate. The browser-delegated activation model saves ~2–3 days vs the original AuthenticationProvider approach and eliminates ~450 LOC of security-critical code. See [subphase plan V2](20260212_PROPOSED_SUBPHASE_PLAN_FOR_MULTI_USER_PHASE_3_V2.md) for per-subphase effort estimates.

---

## 8. Risk Mitigation

| Risk                                                             | Mitigation                                                                                               | Phase |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----- |
| Keygen policy change causes unexpected behavior                  | Query policies after change to confirm; smoke test with existing license                                 | 0     |
| Auth extraction breaks portal routes                             | Pure refactor; identical behavior; test every route                                                      | 1     |
| ~~PKCE implementation complexity~~                               | **Eliminated** — browser-delegated model uses website's existing Cognito session; no PKCE in extension    | —     |
| ~~`vscode://` URI handler inconsistency across OS~~              | **Eliminated** — `vscode.env.openExternal()` reliably opens URLs across all environments                 | —     |
| Extension + backend version mismatch during rollout              | 3A and 3B deploy independently; 3B provides backward compatibility; 3E requires auth only after `/activate` page and polling are in place. No Marketplace stale-version risk (Mouse is pre-Marketplace; VSIX install is controlled). | 3     |
| ~~Token refresh race during heartbeat~~                          | **Eliminated** — extension never holds tokens; heartbeats carry no JWT                                    | —     |
| DynamoDB device record churn (DEACTIVATE_DEAD retained) | Extension handles transparent re-activation; DynamoDB updates existing record by fingerprint (not creating new records). Machine ID churn on Keygen is accepted; DynamoDB maintains lifecycle continuity per physical device. | 3     |

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
- [ ] Unauthenticated activation attempts are rejected with HTTP 401
- [ ] No hardcoded secrets; all credentials from SSM/SecretStorage
- [ ] Documentation updated with API contract for authenticated activation

---

_End of implementation plan._
