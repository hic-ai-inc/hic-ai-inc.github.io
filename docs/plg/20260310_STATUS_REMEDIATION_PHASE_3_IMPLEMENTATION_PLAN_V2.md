# Status Remediation — Phase 3 Implementation Plan (V2)

**Date:** 2026-03-10
**Author:** AI Coding Assistant (GitHub Copilot, Claude Opus 4.6)
**Status:** PROPOSED — Awaiting SWR approval
**Repo:** `hic-ai-inc/hic-ai-inc.github.io` (website repo)
**Branch:** `development`
**Prerequisites:** Phase 1 complete (commit `e2f5147`), Phase 2 complete (Mouse v0.10.16, commit `45ed5273` in extension repo)
**Supersedes:** `20260309_STATUS_REMEDIATION_PROPOSED_PHASE_3_IMPLEMENTATION_PLAN.md` (v1, flagged for AI corruption)

---

## Purpose

This memo describes the implementation plan for Phase 3 of the Status Remediation Plan. Phase 3 returns to the website repo to complete the heartbeat route overhaul, deploy the SES layer changes deferred from Phase 1, configure production dashboards, and run the final checkpoint.

**Design reference:** The heartbeat schema analysis (`20260309_HEARTBEAT_REQUEST_RESPONSE_SCHEMA_ANALYSIS.md`, authored with SWR design direction) is the authoritative source for the fingerprint-based device resolution design. This memo implements that design.

---

## Scope

Phase 3 contains four workstreams:

| #   | Workstream                                                     | Nature                                       | Files                 |
| --- | -------------------------------------------------------------- | -------------------------------------------- | --------------------- |
| 1   | Fix hardcoded `status: "active"` in heartbeat success response | Phase 1 bug fix (Req 7.3/7.4 incomplete)     | 1 source file, tests  |
| 2   | Implement fingerprint-based device resolution                  | New capability per heartbeat schema analysis | 2 source files, tests |
| 3   | SES layer rebuild + deployment                                 | Deferred from Phase 1                        | Infrastructure        |
| 4   | Production configuration + final checkpoint                    | Tasks 16, 17 from `tasks.md`                 | Manual + test run     |

**All work targets the website repo.** No extension changes.

---

## Design Context: Why Fingerprint-Based Resolution

The heartbeat is designed so that post-activation devices **do not retransmit the license key**. The two places where users interact directly with license keys — the purchase success page and the `Mouse: Enter License Key` activation flow — are sensitive, authenticated operations. The heartbeat, which fires every 10 minutes, should not carry sensitive credentials.

After activation, the fingerprint alone suffices to identify a device. The activation flow creates a DDB device record binding fingerprint → user → license. The heartbeat only needs to:

1. Prove a previously-activated device is still alive (fingerprint + machineId)
2. Relay the Keygen machine heartbeat ping (maintains Keygen's heartbeat monitor)
3. Receive back the current license status, member status, device counts, and version info

The `!licenseKey` branch in the current heartbeat route is therefore the **expected steady-state path** for all post-activation heartbeats, not an edge case. Today this branch incorrectly handles the request as a trial heartbeat. Phase 3 replaces it with fingerprint-based device resolution.

---

## 1. Current State of the Heartbeat Route

**File:** `plg-website/src/app/api/license/heartbeat/route.js` (~414 lines)

### 1.1 Problems to Fix

**Problem 1: Hardcoded `status: "active"` (Lines 375, 379)**

The success response always returns `status: "active"` regardless of the actual license status. A `past_due` or `cancellation_pending` license is reported as `"active"`. Phase 1 Task 9.2 added status classification guards for blocking statuses (expired/suspended/revoked → `{ valid: false }`), but the success path was not updated to pass through the actual status. This is an incomplete implementation of Requirements 7.3 and 7.4.

**Problem 2: `!licenseKey` Branch Returns Trial Response (Lines 132–175)**

The current `!licenseKey` branch calls `recordTrialHeartbeat()` and returns `status: "trial"`. However:

- Trial devices never heartbeat — the extension only starts the heartbeat manager after activation (two independent guards: `extension.js` L132, `heartbeat.js` L81-84).
- Post-activation licensed devices heartbeat **without** `licenseKey` — this is the designed behavior, not a bug.
- The `recordTrialHeartbeat` function writes `TRIAL#{deviceId}/HEARTBEAT` records that serve no purpose.

The `!licenseKey` branch must become the fingerprint-based device resolution path for post-activation licensed devices.

**Problem 3: Rate Limiting Uses `licenseKey` as Identifier (Line 93, Line 370)**

The rate limit middleware identifies requests by `body.licenseKey`. Since post-activation heartbeats send `licenseKey: null`, rate limiting is ineffective for all steady-state heartbeats. Both the middleware identifier (line 93) and the `getRateLimitHeaders` call (line 370) must fall back to `fingerprint`.

### 1.2 What Works Correctly (No Changes Needed)

- Keygen machine heartbeat ping (fingerprint-based — already correct)
- DDB license lookup via `getLicenseByKey` (GSI2 query)
- Status classification guard (expired/suspended/revoked → `{ valid: false }`)
- Device `lastSeenAt` update (fire-and-forget)
- Active device count via sliding window
- Version config response
- Over-limit check and response
- Error handling

---

## 2. Design Decision: Pointer Record for Fingerprint→License Resolution

The heartbeat route needs to resolve a device's license when `licenseKey` is absent. The device record in DDB uses a composite key: `PK: LICENSE#{keygenLicenseId}, SK: DEVICE#{fingerprint}`. This means we cannot look up a device by fingerprint alone without first knowing the `keygenLicenseId`.

### Option A: Pointer Record (Selected)

Write a lightweight record `PK: DEVICE_FP#${fingerprint}, SK: POINTER` during the heartbeat that maps the fingerprint to the license.

**Rationale:**

- **Zero infrastructure changes.** No CloudFormation update, no GSI deployment, no stack rollout risk. Pure code change.
- **Single strongly-consistent GetItem** — 1 RCU, ~1ms latency. GSI queries are eventually consistent by default.
- **Follows existing patterns.** The codebase already uses `TRIAL#${fingerprint}` and `FPLOCK#${fingerprint}` as fingerprint-keyed records. This is the established idiom.
- **Immediate deployment.** Ships with the Next.js deployment; no CF dependency.
- **Self-correcting.** Stale pointers (e.g., after device deactivation) resolve to a non-existent device record → `machine_not_found` → extension re-activates. No explicit cleanup required.

### Option B: GSI4 on Fingerprint (Rejected)

Requires CloudFormation stack update, GSI backfill, two-phase deployment, eventually consistent reads, and ongoing index cost. Overkill for a simple one-fingerprint-to-one-device lookup.

---

## 3. End-State Heartbeat Route Flow

After Phase 3, the heartbeat route will have the following control flow:

```
POST /api/license/heartbeat
  ├── Rate limiting (identifier: licenseKey || fingerprint)
  ├── Parse body: { fingerprint, machineId, sessionId, licenseKey }
  ├── Validate fingerprint (required)
  │
  ├── IF licenseKey present:
  │   ├── Validate machineId, sessionId (required)
  │   ├── Validate license key format (CWE-306)
  │   ├── license = getLicenseByKey(licenseKey)                    ← GSI2 query
  │   ├── putDevicePointer(fingerprint, {...}) (fire-and-forget)   ← opportunistic
  │   └── (continue to common licensed path)
  │
  ├── ELSE (no licenseKey — expected steady-state):
  │   ├── Lookup device pointer: getDevicePointer(fingerprint)     ← GetItem
  │   ├── IF no pointer found:
  │   │   └── Return { valid: false, status: "machine_not_found" }
  │   ├── Validate machineId, sessionId (required)
  │   ├── license = getLicenseByKey(pointer.licenseKey)             ← GSI2 query
  │   └── (continue to common licensed path)
  │
  ├── COMMON LICENSED PATH:
  │   ├── Ping Keygen machine heartbeat (machineHeartbeat)
  │   ├── Resolve deviceUserId from device record
  │   ├── Null license guard → 404
  │   ├── Status classification: expired/suspended/revoked → { valid: false }
  │   ├── Update device lastSeenAt (fire-and-forget)
  │   ├── Get active device count (sliding window)
  │   ├── Get version config
  │   ├── Over-limit check → { valid: true, status: "over_limit" }
  │   └── Success → { valid: true, status: license.status }        ← ACTUAL status
  │
  └── Error handler → { valid: false, status: "error" }
```

### Key Changes from Current Flow

1. **`!licenseKey` branch: trial response → fingerprint-based device resolution.** The `recordTrialHeartbeat` call and `status: "trial"` response are removed. The branch now resolves the device pointer, extracts the `licenseKey`, and converges into the common licensed path.
2. **`status: "active"` → `status: license.status`.** The success response reflects the actual license status (`active`, `past_due`, `cancellation_pending`).
3. **Rate limiting: `licenseKey` → `licenseKey || fingerprint`.** Both the middleware identifier and the response headers use fingerprint as the fallback.
4. **Opportunistic pointer write.** When `licenseKey` IS present, the route writes the device pointer as a fire-and-forget side effect. This ensures the pointer exists for subsequent fingerprint-only heartbeats without modifying the activation path.

### Why Validation Order Changes for the Fingerprint Path

In the current code, `machineId` and `sessionId` validation occurs after the trial branch but before the Keygen ping. For the fingerprint-resolved path, we validate `machineId`/`sessionId` **after** the pointer lookup succeeds (not before), because a missing pointer means neither field is useful. The license key format check is skipped entirely on the fingerprint path (no key to validate).

---

## 4. File-by-File Implementation Plan

### 4.1 DynamoDB Module — Pointer Record Operations

**File:** `plg-website/src/lib/dynamodb.js`

#### New function: `putDevicePointer(fingerprint, data)`

Writes a pointer record during heartbeat (opportunistic, fire-and-forget):

```js
/**
 * Write a fingerprint→license pointer record.
 * Enables heartbeat device resolution when licenseKey is absent.
 * Pattern: PK=DEVICE_FP#${fingerprint}, SK=POINTER
 */
export async function putDevicePointer(
  fingerprint,
  { keygenLicenseId, licenseKey, userId },
) {
  await dynamodb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `DEVICE_FP#${fingerprint}`,
        SK: "POINTER",
        keygenLicenseId,
        licenseKey,
        userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    }),
  );
}
```

#### New function: `getDevicePointer(fingerprint)`

Reads the pointer record by fingerprint:

```js
/**
 * Look up a device's license by fingerprint.
 * Returns the pointer record or null if no activated device exists.
 */
export async function getDevicePointer(fingerprint) {
  const result = await dynamodb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `DEVICE_FP#${fingerprint}`,
        SK: "POINTER",
      },
    }),
  );
  return result.Item || null;
}
```

#### Remove: `recordTrialHeartbeat()`

Delete the `recordTrialHeartbeat` function. It is only called from the `!licenseKey` branch being replaced. The `TRIAL#{fp}/TRIAL` record pattern used by `/api/license/validate` for trial token management is **unaffected** — that's a separate set of functions (`getTrialByFingerprint`, `createTrial`).

---

### 4.2 Heartbeat Route — Overhaul

**File:** `plg-website/src/app/api/license/heartbeat/route.js`

#### Change 1: Update imports (Lines 20–27)

```js
// Remove: recordTrialHeartbeat
// Add: getDevicePointer, putDevicePointer
import {
  updateDeviceLastSeen,
  getLicenseByKey,
  getDeviceByFingerprint,
  getDevicePointer,
  putDevicePointer,
  getVersionConfig,
  getActiveDevicesInWindow,
} from "@/lib/dynamodb";
```

#### Change 2: Update rate limit identifier (Line 93)

```js
// Before:
getIdentifier: (body) => body.licenseKey,
// After:
getIdentifier: (body) => body.licenseKey || body.fingerprint,
```

This ensures fingerprint-based heartbeats are still rate-limited per device.

#### Change 3: Change `const` → `let` for destructured body (Line 114)

```js
// Before:
const { machineId, sessionId, licenseKey, fingerprint, userId } = body;
// After:
let { machineId, sessionId, licenseKey, fingerprint, userId } = body;
```

The fingerprint resolution path reassigns `licenseKey` from the pointer record, so it cannot be `const`.

#### Change 4: Replace trial heartbeat branch with fingerprint-based resolution (Lines 132–175)

Remove the entire trial heartbeat block. Replace with:

```js
// =========================================================================
// FINGERPRINT-BASED DEVICE RESOLUTION (no license key)
// =========================================================================
// Post-activation heartbeats do not carry the license key. The device was
// bound to a user and license during the authenticated activation flow.
// We resolve the device by fingerprint alone using the pointer record.
if (!licenseKey) {
  const devicePointer = await getDevicePointer(fingerprint);

  if (!devicePointer) {
    log.decision(
      "device_pointer_not_found",
      "No activated device for fingerprint",
      { fingerprint: fingerprint.substring(0, 8) + "..." },
    );
    log.response(200, "Heartbeat device not found", {
      status: "machine_not_found",
    });
    return NextResponse.json({
      valid: false,
      status: "machine_not_found",
      reason: "No activated device found for this fingerprint",
    });
  }

  // Resolved — continue with the licensed-user flow using the pointer's licenseKey.
  licenseKey = devicePointer.licenseKey;
  log.info("fingerprint_resolved", "Device resolved by fingerprint", {
    fingerprint: fingerprint.substring(0, 8) + "...",
    hasLicenseKey: true,
  });
}
```

After resolution, `licenseKey` holds the value from the pointer. The rest of the handler (machineId/sessionId validation, key format validation, Keygen ping, DDB license lookup, status classification, device count, success response) executes unchanged.

#### Change 5: Fix hardcoded `status: "active"` in success response (Lines 375, 379)

```js
// Line 375 — log line:
// Before:
log.response(200, "Heartbeat succeeded", { status: "active" });
// After:
log.response(200, "Heartbeat succeeded", { status: license.status });

// Line 379 — response body:
// Before:
status: "active",
// After:
status: license.status,
```

This ensures the extension receives the actual license status (`active`, `past_due`, `cancellation_pending`) as required by the Phase 2 two-dimensional state model.

#### Change 6: Add opportunistic pointer write (after device record lookup, before status classification)

When `licenseKey` was present in the original request (not resolved from pointer), write the device pointer as a fire-and-forget side effect. This is placed after the `deviceUserId` resolution (so we have all pointer fields) and before the status gates:

```js
// Write device pointer opportunistically for future fingerprint-based resolution.
// Only when licenseKey was in the original request (not already resolved from pointer).
if (body.licenseKey && license?.keygenLicenseId) {
  putDevicePointer(fingerprint, {
    keygenLicenseId: license.keygenLicenseId,
    licenseKey: body.licenseKey,
    userId: deviceUserId,
  }).catch((err) => {
    log.warn(
      "pointer_write_failed",
      "Opportunistic pointer write failed (non-fatal)",
      {
        fingerprint: fingerprint.substring(0, 8) + "...",
        error: err.message,
      },
    );
  });
}
```

**Design note:** We use `body.licenseKey` (the original request field) rather than the reassigned `licenseKey` local variable to distinguish "key was in the request" from "key was resolved from pointer." This avoids writing the pointer back from values we just read from it — wasteful and circular.

#### Change 7: Update `getRateLimitHeaders` call (Line 370)

```js
// Before:
const rateLimitHeaders = getRateLimitHeaders(
  licenseKey,
  RATE_LIMIT_PRESETS.heartbeat,
);
// After:
const rateLimitHeaders = getRateLimitHeaders(
  body.licenseKey || fingerprint,
  RATE_LIMIT_PRESETS.heartbeat,
);
```

#### Change 8: Update JSDoc header (Lines 1–15)

Update to reflect the new flow:

```js
/**
 * License Heartbeat API
 *
 * POST /api/license/heartbeat
 *
 * Called periodically by the VS Code extension (default: every 10 minutes)
 * to verify license status, enforce concurrent device limits, and update
 * last-seen timestamps.
 *
 * Post-activation heartbeats do not carry the license key. The device's
 * fingerprint resolves to the license via a pointer record written during
 * the first heartbeat after activation. If the license key IS present
 * (e.g., the initial heartbeat triggered by activation), it is used
 * directly and the pointer record is written opportunistically.
 *
 * @see 20260309_HEARTBEAT_REQUEST_RESPONSE_SCHEMA_ANALYSIS.md
 * @see PLG Technical Specification v2 - Section 3.3
 */
```

---

### 4.3 Dead Code Removal

**Files to update:**

1. **`plg-website/src/lib/dynamodb.js`** — Remove `recordTrialHeartbeat` function.
2. **`plg-website/src/app/api/license/heartbeat/route.js`** — Remove `recordTrialHeartbeat` import (handled in Change 1 above).
3. **Test files** — Remove or update trial heartbeat references:
   - `__tests__/unit/api/heartbeat.test.js` — "trial heartbeat" test group (~lines 231–248), trial rejection test (~line 201), trial auth test (~line 640)
   - `__tests__/unit/api/heartbeat-route.contract.test.js` — trial heartbeat contract test (~line 104)
   - `__tests__/unit/lib/dynamodb.test.js` — any `recordTrialHeartbeat` tests
   - `__tests__/e2e/lib/test-data.js` — trial heartbeat JSDoc reference (~line 167)

---

## 5. Tests

### 5.1 Unit Tests — New and Updated

#### DynamoDB pointer operations (new tests)

**File:** `__tests__/unit/lib/dynamodb.test.js` (expand existing)

| Test                                                    | Assertion                                                                                  |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `putDevicePointer` writes correct PK/SK                 | PK = `DEVICE_FP#${fp}`, SK = `POINTER`, contains `keygenLicenseId`, `licenseKey`, `userId` |
| `getDevicePointer` returns record for known fingerprint | Returns object with `keygenLicenseId`, `licenseKey`                                        |
| `getDevicePointer` returns null for unknown fingerprint | Returns `null`                                                                             |

#### Heartbeat route — fingerprint resolution (new tests)

**File:** `__tests__/unit/api/heartbeat.test.js` (expand existing, replacing trial heartbeat tests)

| Test                                                                 | Assertion                                                                     |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Fingerprint-only heartbeat resolves via pointer                      | When licenseKey absent, pointer found → same response as direct-key heartbeat |
| Fingerprint-only heartbeat returns machine_not_found when no pointer | No pointer record → `{ valid: false, status: "machine_not_found" }`           |
| Direct licenseKey heartbeat still works (no regression)              | Existing behavior unchanged when licenseKey is present                        |
| Rate limiting uses fingerprint when licenseKey absent                | Rate limit identifier falls back to fingerprint                               |

#### Heartbeat route — status passthrough (new tests)

| Test                                                          | Assertion                                                                          |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Active license returns `status: "active"`                     | license.status = "active" → response status = "active"                             |
| Past-due license returns `status: "past_due"`                 | license.status = "past_due" → response status = "past_due"                         |
| Cancellation-pending returns `status: "cancellation_pending"` | license.status = "cancellation_pending" → response status = "cancellation_pending" |

#### Heartbeat route — opportunistic pointer write (new tests)

| Test                                                               | Assertion                                                                               |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Heartbeat with licenseKey writes device pointer                    | After heartbeat, `getDevicePointer(fingerprint)` returns pointer with correct data      |
| Pointer write failure does not affect heartbeat response           | If `putDevicePointer` throws, heartbeat still returns success                           |
| Fingerprint-only heartbeat after pointer write resolves correctly  | First heartbeat (with key) + second heartbeat (without key) → same `valid: true` result |
| Pointer write only happens when licenseKey was in original request | Fingerprint-resolved heartbeat does NOT re-write the pointer                            |

#### Dead code removal verification

| Test                                         | Assertion                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------- |
| No trial heartbeat path exists               | Heartbeat with no licenseKey and no pointer → `machine_not_found` (not `trial`) |
| `recordTrialHeartbeat` not imported in route | Import verification                                                             |

### 5.2 Property Tests — New

#### Property 23: Fingerprint-based heartbeat equivalence

**Tag:** `// Feature: status-remediation-plan, Property 23`
**File:** `__tests__/property/api/heartbeat.property.test.js` (expand existing)

**Property:** For any device with a valid pointer record, a heartbeat sent without `licenseKey` must produce the same `{ valid, status }` response as a heartbeat sent with the correct `licenseKey`.

| Sub-test                           | Iterations | Assertion                                  |
| ---------------------------------- | ---------- | ------------------------------------------ |
| Active license, fingerprint-only   | 100        | Same response as direct-key                |
| Past-due license, fingerprint-only | 100        | Same response as direct-key                |
| Expired license, fingerprint-only  | 100        | Same `{ valid: false, status: "expired" }` |

#### Property 24: Heartbeat status passthrough

**Tag:** `// Feature: status-remediation-plan, Property 24`
**File:** `__tests__/property/api/heartbeat.property.test.js` (expand existing)

**Property:** For any license with status in `{active, past_due, cancellation_pending}`, the heartbeat success response's `status` field must equal `license.status` (not hardcoded `"active"`).

| Sub-test                          | Iterations | Assertion                                  |
| --------------------------------- | ---------- | ------------------------------------------ |
| Random valid status               | 100        | Response status === license.status         |
| past_due specifically             | 100        | Response status === "past_due"             |
| cancellation_pending specifically | 100        | Response status === "cancellation_pending" |

#### Property 25: Opportunistic pointer write consistency

**Tag:** `// Feature: status-remediation-plan, Property 25`
**File:** `__tests__/property/api/heartbeat.property.test.js` (expand existing)

**Property:** For any licensed heartbeat where `licenseKey` is present in the request, the device pointer must exist after the heartbeat completes. A subsequent fingerprint-only heartbeat (same device, no `licenseKey`) must resolve to the same license.

---

## 6. Staging Deployment

### 6.1 Build and Publish `hic-ses-layer`

The `licenseSuspended` email template was removed in Phase 1 Fix 5 (Task 6.8). The SES layer currently published (v0.2.8) predates this change and was not redeployed during Phase 1. Rebuild to incorporate the template removal.

```bash
cd dm/layers/ses
# Bump version in version.manifest.json (0.2.8 → 0.2.9)
bash build.sh
bash publish.sh
```

### 6.2 Deploy Lambda Functions

```bash
cd plg-website/infrastructure
bash update-lambdas.sh staging
```

### 6.3 Deploy Next.js Application

The heartbeat route changes ship as part of the Next.js application deployed via Amplify. After pushing to `development`, Amplify auto-builds and deploys to staging.

---

## 7. Production Configuration (Task 16 — Manual, SWR)

Prior to the final checkpoint:

- **16.1:** Configure Stripe Smart Retries — maximum 8 retries over 2-week maximum duration, subscription cancellation after all retries fail.
- **16.2:** Configure Keygen policy durations — Monthly: 44 days (3,801,600s), Annual: 379 days (32,745,600s).

---

## 8. Final Checkpoint (Task 17)

- Run the full test suite (PLG + DM) and verify all tests pass
- Verify test coverage meets >80% threshold
- Confirm all 25 properties pass (22 original + 3 new)
- Verify staging deployment is operational

---

## 9. Execution Order

1. **Status passthrough fix** (Section 4.2 Changes 5) — Independent 2-line fix, can land as its own commit
2. **DynamoDB module changes** (Section 4.1) — `putDevicePointer`, `getDevicePointer`, remove `recordTrialHeartbeat`
3. **Heartbeat route overhaul** (Section 4.2 Changes 1–4, 6–8) — Fingerprint resolution, opportunistic pointer write, rate limit fix, JSDoc
4. **Dead code removal** (Section 4.3) — Remove trial heartbeat test references
5. **Test updates** (Section 5) — New pointer/resolution/passthrough tests; update/remove trial heartbeat tests
6. **Run full test suite** — Verify no regressions
7. **SES layer build and publish** (Section 6.1)
8. **Lambda deployment** (Section 6.2)
9. **Push to development** — Triggers Amplify staging deployment (Section 6.3)
10. **Task 16** — Stripe/Keygen dashboard configuration (SWR manual)
11. **Task 17** — Final checkpoint

---

## 10. `tasks.md` Updates Required

The following items should be added after Task 15 in `.kiro/specs/status-remediation-plan/tasks.md`:

```markdown
- [ ] P3.1. Fix heartbeat status passthrough (Phase 1 Req 7.3/7.4 completion)
  - [ ] P3.1.1 Change success response from status: "active" to status: license.status
  - [ ] P3.1.2 Update log line to reflect actual status
  - [ ] P3.1.3 Add status passthrough unit tests (active, past_due, cancellation_pending)
  - [ ] P3.1.4 Property 24: Heartbeat status passthrough

- [ ] P3.2. Implement fingerprint-based device resolution in heartbeat route
  - [ ] P3.2.1 Add putDevicePointer and getDevicePointer to dynamodb.js
  - [ ] P3.2.2 Replace trial heartbeat branch with fingerprint resolution
  - [ ] P3.2.3 Add opportunistic pointer write (fire-and-forget, original-key-only)
  - [ ] P3.2.4 Update rate limiter to fall back to fingerprint identifier
  - [ ] P3.2.5 Update getRateLimitHeaders to fall back to fingerprint
  - [ ] P3.2.6 Change const → let for destructured body fields
  - [ ] P3.2.7 Update JSDoc header
  - [ ] P3.2.8 Unit tests for pointer record CRUD
  - [ ] P3.2.9 Unit tests for fingerprint-based heartbeat resolution
  - [ ] P3.2.10 Unit tests for opportunistic pointer write
  - [ ] P3.2.11 Property 23: Fingerprint-based heartbeat equivalence
  - [ ] P3.2.12 Property 25: Opportunistic pointer write consistency

- [ ] P3.3. Remove dead trial heartbeat code and tests
  - [ ] P3.3.1 Remove recordTrialHeartbeat from dynamodb.js
  - [ ] P3.3.2 Remove recordTrialHeartbeat import from heartbeat route
  - [ ] P3.3.3 Remove/update trial heartbeat test cases in heartbeat.test.js
  - [ ] P3.3.4 Remove trial heartbeat contract test in heartbeat-route.contract.test.js
  - [ ] P3.3.5 Remove recordTrialHeartbeat tests from dynamodb.test.js

- [ ] P3.4. Checkpoint — Phase 3 implementation complete
  - Run full test suite, verify no regressions

- [ ] P3.5. Staging deployment
  - [ ] P3.5.1 Build and publish hic-ses-layer (version bump 0.2.8 → 0.2.9)
  - [ ] P3.5.2 Run update-lambdas.sh staging
  - [ ] P3.5.3 Push to development (triggers Amplify staging deploy)
```

Tasks 16, 16.1, 16.2, and 17 remain as-is (already in the checklist).

---

## 11. Security Considerations

| Concern                                          | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fingerprint enumeration**                      | The pointer record only exists when a device has completed the authenticated activation flow. A random fingerprint resolves to nothing — returns `machine_not_found`. No information leakage about whether a fingerprint exists in DDB (both "no pointer" and "no device" return the same response).                                                                                                                                                                                   |
| **License key exposure**                         | The license key stored in the pointer record is never returned in the heartbeat response. It's used server-side only for the DDB license lookup.                                                                                                                                                                                                                                                                                                                                       |
| **Stale pointer after deactivation**             | No explicit cleanup needed. A stale pointer resolves to a device record that no longer exists → `machine_not_found`. Self-correcting.                                                                                                                                                                                                                                                                                                                                                  |
| **Race condition: activation + first heartbeat** | The first heartbeat after activation may carry `licenseKey` (available briefly in session state). If it does, the opportunistic pointer write fires. If it doesn't (key already gone), the heartbeat falls through to the pointer path, finds nothing, and returns `machine_not_found`. The extension re-activates, creating the binding. This is an existing limitation unrelated to Phase 3 — the pointer write ensures it self-heals on the next heartbeat that does carry the key. |
| **Rate limiting bypass**                         | Fingerprint replaces licenseKey as the rate limit key for pointer-resolved heartbeats. Both identifiers are per-device, preserving rate limiting effectiveness.                                                                                                                                                                                                                                                                                                                        |

---

## 12. Traceability

| Phase 3 Task                | `tasks.md` Task              | requirements.md                              |
| --------------------------- | ---------------------------- | -------------------------------------------- |
| P3.1 Status passthrough     | NEW (completes Task 9.2)     | Req 7.3, 7.4                                 |
| P3.2 Fingerprint resolution | NEW                          | Extends Req 7, per heartbeat schema analysis |
| P3.3 Trial code removal     | NEW                          | Codebase hygiene                             |
| P3.4 Checkpoint             | Maps to Task 17 precondition | Req 14.2                                     |
| P3.5 Staging deployment     | NEW                          | Operational                                  |
| Task 16                     | Existing                     | Req 12                                       |
| Task 17                     | Existing                     | Req 14.3                                     |

---

## 13. Deferred Items (Carried Forward)

These remain deferred from Phase 1, unchanged:

- **D1:** Email templates for member suspension, revocation, and reinstatement
- **D2:** Distinct marketing/communication paths for revoked vs. expired users
- **D3:** Revocation does not expire the org license (documented as final behavior, not deferred)

---

## Reference Documents

| Document                                                                  | Purpose                                                                                               |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `20260308_PHASE_1_COMPLETION_AND_HANDOFF_MEMO.md`                         | Phase 1 summary, 9 fixes, architectural decisions                                                     |
| `20260309_STATUS_REMEDIATION_PLAN_PHASE_2_COMPLETION_AND_HANDOFF_MEMO.md` | Phase 2 summary, two-dimensional state model, extension alignment                                     |
| `20260309_HEARTBEAT_REQUEST_RESPONSE_SCHEMA_ANALYSIS.md`                  | Root-cause heartbeat analysis, fingerprint-based resolution design (SWR direction)                    |
| `20260309_STATUS_REMEDIATION_PROPOSED_PHASE_3_IMPLEMENTATION_PLAN.md`     | V1 proposed plan (superseded by this memo, retained for historical record with AI corruption warning) |
| `.kiro/specs/status-remediation-plan/requirements.md`                     | 15 requirements with acceptance criteria                                                              |
| `.kiro/specs/status-remediation-plan/tasks.md`                            | Full task list with completion marks                                                                  |
| `.kiro/specs/status-remediation-plan/design.md`                           | Consolidated plan (V6)                                                                                |

---

_End of memo._
