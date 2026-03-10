# Status Remediation — Proposed Phase 3 Implementation Plan

**Date:** 2026-03-09
**Author:** AI Coding Assistant (GitHub Copilot, Claude Opus 4.6)
**Status:** PROPOSED — Awaiting SWR approval
**Repo:** `hic-ai-inc/hic-ai-inc.github.io` (website repo)
**Branch:** `development`
**Prerequisites:** Phase 1 complete (commit `e2f5147`), Phase 2 complete (Mouse v0.10.16, commit `45ed5273` in extension repo)

**WARNING: THIS FILE MAY HAVE BEEN CORRUPTED BY AN AI ASSISTANT. VERIFY ALL CONTENT CAREFULLY BEFORE USING AS A REFERENCE.**

---

## Purpose

This memo describes the proposed implementation plan for Phase 3 of the Status Remediation Plan. Phase 3 returns to the website repo to complete three areas of work:

1. **Heartbeat route overhaul** — Fix the hardcoded `status: "active"` response, implement fingerprint-based device resolution for licensed users whose `licenseKey` is absent, and remove unreachable trial heartbeat code.
2. **Staging deployment** — Build and publish the updated `hic-ses-layer`, then run `update-lambdas.sh staging` to deploy updated Lambda code and layer versions.
3. **Final checkpoints** — Run the full test suite, verify coverage, and confirm Stripe/Keygen dashboard configuration (Task 16).

All work targets the website repo (`hic-ai-inc/hic-ai-inc.github.io`). No changes to the extension repo are included.

---

## 1. Design Decision: Pointer Record vs. GSI for Fingerprint-Based Device Lookup

The heartbeat route needs to resolve a device's license when `licenseKey` is absent. The device record in DDB uses a composite key: `PK: LICENSE#${keygenLicenseId}, SK: DEVICE#${fingerprint}`. This means we cannot look up a device by fingerprint alone without first knowing the `keygenLicenseId`.

Two approaches were considered:

### Option A: Pointer Record (Recommended)

Write a lightweight record `PK: DEVICE_FP#${fingerprint}, SK: POINTER` during device activation that maps the fingerprint to the license.

**Pros:**

- **Zero infrastructure changes.** No CloudFormation update, no GSI deployment, no stack rollout risk. Pure code change.
- **Simple GetItem** — a single DDB read (1 RCU, ~1ms latency). GSI queries are eventually consistent by default and use Query, not GetItem.
- **Follows existing patterns.** The codebase already uses `TRIAL#${fingerprint}` and `FPLOCK#${fingerprint}` as fingerprint-keyed records. This is the established idiom.
- **Immediate deployment.** Code ships with the Next.js deployment; no CF dependency.
- **Self-correcting.** Stale pointers (e.g., after device deactivation) are harmless — the heartbeat resolves to a non-existent device record, returns `machine_not_found`, and the extension re-activates. No explicit cleanup required.

**Cons:**

- **One extra write** per heartbeat (when `licenseKey` present and pointer doesn't exist yet). Amortized: the pointer is written once, on the first successful heartbeat after activation.
- **Data duplication.** The pointer duplicates `keygenLicenseId` and `licenseKey` from the device record. Acceptable for a lightweight lookup index.

### Option B: GSI4 on Fingerprint

Add a new Global Secondary Index with `fingerprint` as the partition key.

**Pros:**

- **No data duplication.** Queries directly against the canonical device record.
- **No consistency concern.** No separate pointer to get out of sync.
- **General-purpose.** Could answer broader queries ("find all devices with this fingerprint across all licenses") if ever needed.

**Cons:**

- **CloudFormation stack update required.** Must deploy a new GSI to the `hic-plg-${env}` DynamoDB table. This involves modifying `plg-website/infrastructure/cloudformation/plg-dynamodb.yaml`, deploying the CF stack, and waiting for GSI backfill to complete. Any failure blocks the deployment.
- **Eventually consistent reads.** GSI queries are eventually consistent by default. During high-frequency heartbeats (every 10 minutes), a device activated moments ago might not yet appear in the GSI. Pointer records use strongly consistent GetItem.
- **Must add GSI4PK/GSI4SK attributes** to all existing and future device records. Existing device records (already activated) would need a one-time backfill to populate the new attributes.
- **Higher complexity.** A new GSI adds ongoing cost (storage + read capacity for the index), and adds a fourth index to reason about in the schema.
- **Two-phase deployment.** The CF stack update must complete (and GSI backfill must finish) before the heartbeat code can use it. Code cannot be deployed simultaneously with infrastructure.

### Decision: Pointer Record (Option A)

The pointer record is clearly the better fit for this use case:

- The lookup pattern is simple: one fingerprint → one device.
- Zero infrastructure changes, zero deployment risk.
- Follows the established `TRIAL#`, `FPLOCK#` convention.
- Strongly consistent reads — no propagation delay.
- Can ship in a single code deployment.

---

## 2. Current Heartbeat Route: Problems to Fix

The heartbeat route (`plg-website/src/app/api/license/heartbeat/route.js`, ~420 lines) has three problems to address in Phase 3:

### Problem 1: Hardcoded `status: "active"` Response (Lines 375-379)

The success response always returns `status: "active"`, regardless of the actual license status. A `past_due` or `cancellation_pending` license is reported as `"active"`. The Phase 2 extension now expects the actual license status to drive the two-dimensional state model (`past_due` → status bar warning, billing nag messages, etc.).

**Current code (line 379):**

```js
status: "active",
```

**Required:** Return `license.status` (or the appropriate status string) so the extension receives the true license-level state.

### Problem 2: Unreachable Trial Heartbeat Path (Lines 134-171)

The `!licenseKey` branch records a trial heartbeat to DDB and returns `status: "trial"`. However, as confirmed by code tracing in both repos, the extension **never sends a heartbeat for trial devices**:

1. `extension.js` L132: `if (stateManager.getState().licenseKey)` — heartbeat manager is only instantiated when a license key exists.
2. `mouse-vscode/src/licensing/heartbeat.js` L81-84: Belt-and-suspenders guard: `if (!state.licenseKey) { return false; }`.
3. Trial initialization (`Mouse: Initialize Workspace`) calls `/api/license/validate`, not `/api/license/heartbeat`.
4. `checkLicense()` on every VS Code launch reads from local disk only — no API call.

The trial heartbeat code is dead. The `recordTrialHeartbeat` function in `dynamodb.js` is called only from this unreachable path. The `TRIAL#{fp}/HEARTBEAT` DDB record pattern exists solely for this unused feature.

**Decision:** Remove the trial heartbeat path entirely. The `!licenseKey` branch becomes the fingerprint-based device resolution path for licensed users. This eliminates confusion about which states are actually reachable at the heartbeat API level.

> **Future note:** If trial-device analytics are desired post-launch, the extension would be modified to emit heartbeats pre-activation, and the server would detect trial devices by the absence of a device pointer record. The architecture is modular enough to support this cleanly at that time.

### Problem 3: No Fingerprint-Based Device Resolution (Root-Cause Heartbeat Failure)

When `licenseKey` is absent (the license key was not persisted after the activation flow), the route has no way to identify the device. After removing the trial heartbeat path, this branch must resolve the device by fingerprint alone using the pointer record pattern described in Section 1.

---

## 3. End-State Heartbeat Route Flow

After Phase 3, the heartbeat route will have the following control flow:

```
POST /api/license/heartbeat
  ├── Rate limiting
  ├── Parse body: { fingerprint, machineId, sessionId, licenseKey }
  ├── Validate fingerprint (required)
  │
  ├── IF licenseKey present:
  │   ├── Validate machineId, sessionId (required for licensed heartbeats)
  │   ├── Validate license key format (CWE-306)
  │   ├── license = getLicenseByKey(licenseKey)          ← GSI2 query
  │   ├── putDevicePointer (fire-and-forget)              ← Opportunistic
  │   └── (continue to common licensed path)
  │
  ├── ELSE (no licenseKey):
  │   ├── Lookup device pointer: getDevicePointer(fingerprint)   ← GetItem
  │   ├── IF no pointer found:
  │   │   └── Return { valid: false, status: "machine_not_found" }
  │   ├── Validate machineId, sessionId (required)
  │   ├── license = getLicenseByKey(pointer.licenseKey)  ← GSI2 query
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
  │   └── Success → { valid: true, status: license.status }   ← ACTUAL status
  │
  └── Error handler → { valid: false, status: "error" }
```

### Key changes from current flow:

1. **Trial branch → removed.** Replaced by fingerprint-based device resolution.
2. **`status: "active"` → `status: license.status`.** The response reflects the actual license status (`active`, `past_due`, `cancellation_pending`).
3. **Fingerprint-based device resolution** — new path for when `licenseKey` is absent.
4. **Rate limiting identifier** — currently uses `body.licenseKey` which would be `null` for fingerprint-based heartbeats. Must fall back to `fingerprint` as the rate limit key.
5. **Opportunistic pointer write** — when `licenseKey` IS present, the heartbeat route writes the device pointer as a fire-and-forget side effect. This ensures the pointer exists for subsequent fingerprint-only heartbeats without modifying the activation path.

---

## 4. File-by-File Implementation Plan

### 4.1 DynamoDB Module — Pointer Record Operations

**File:** `plg-website/src/lib/dynamodb.js`

#### New function: `putDevicePointer(fingerprint, data)`

Writes a pointer record during device activation:

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

Delete the `recordTrialHeartbeat` function entirely (~15 lines). It is only called from the unreachable trial heartbeat path in the heartbeat route.

The `TRIAL#{fingerprint}/TRIAL` record pattern (used by `/api/license/validate` for trial token management) is **unaffected** — that's a separate pattern in separate functions (`getTrialByFingerprint`, `createTrial`).

---

### 4.2 Heartbeat Route — Complete Overhaul

**File:** `plg-website/src/app/api/license/heartbeat/route.js`

#### Change 1: Update imports

- Remove: `recordTrialHeartbeat` import
- Add: `getDevicePointer`, `putDevicePointer` imports

#### Change 2: Update rate limit identifier

The current rate limiter uses `body.licenseKey` as the identifier:

```js
const rateLimitResult = await rateLimitMiddleware(request, {
  getIdentifier: (body) => body.licenseKey,
  limits: "heartbeat",
});
```

When `licenseKey` is null, this falls back to... nothing useful. Change to:

```js
getIdentifier: (body) => body.licenseKey || body.fingerprint,
```

This ensures fingerprint-based heartbeats are still rate-limited per device.

#### Change 3: Replace trial heartbeat branch with fingerprint-based resolution

Remove the entire `if (!licenseKey) { ... }` trial block (lines 134-171). Replace with:

```js
// =========================================================================
// FINGERPRINT-BASED DEVICE RESOLUTION (no license key)
// =========================================================================
// Licensed devices whose licenseKey was not persisted locally
// after the browser-based activation flow. We resolve the device
// by fingerprint alone using the pointer record written during activation.
if (!licenseKey) {
  const devicePointer = await getDevicePointer(fingerprint);

  if (!devicePointer) {
    log.decision(
      "device_pointer_not_found",
      "No activated device for fingerprint",
      {
        fingerprint: fingerprint.substring(0, 8) + "...",
      },
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
  // The rest of the handler is shared between direct-key and fingerprint-resolved paths.
  licenseKey = devicePointer.licenseKey;
  log.info("fingerprint_resolved", "Device resolved by fingerprint", {
    fingerprint: fingerprint.substring(0, 8) + "...",
    hasLicenseKey: true,
  });
}
```

**Key detail:** After resolution, `licenseKey` is reassigned to the value from the pointer. The rest of the handler (machineId/sessionId validation, key format validation, Keygen ping, DDB license lookup, status classification, device count, success response) executes unchanged.

**Important:** Because `licenseKey` is destructured with `const`, we need to change the destructuring to `let`:

```js
let { machineId, sessionId, licenseKey, fingerprint, userId } = body;
```

#### Change 4: Fix hardcoded `status: "active"` in success response

**Line 375 (log line):**

```js
// Before:
log.response(200, "Heartbeat succeeded", { status: "active" });
// After:
log.response(200, "Heartbeat succeeded", { status: license.status });
```

**Line 379 (response body):**

```js
// Before:
status: "active",
// After:
status: license.status,
```

This ensures the extension receives the actual license status (`active`, `past_due`, `cancellation_pending`) as required by the Phase 2 two-dimensional state model.

#### Change 5: Update JSDoc and comments

Update the file-level JSDoc to reflect the new flow:

- Remove references to trial heartbeats
- Add fingerprint-based device resolution documentation
- Note that `licenseKey` is optional (resolved from pointer when absent)

#### Change 6: Opportunistic device pointer write

When `licenseKey` IS present (the normal case — extension sends the key), write the device pointer as a fire-and-forget side effect after a successful heartbeat. This ensures the pointer exists for any subsequent fingerprint-only heartbeats without modifying the activation path.

```js
// After successful licensed heartbeat processing (before success response):
// Write device pointer opportunistically for future fingerprint-based resolution.
putDevicePointer(fingerprint, {
  keygenLicenseId: license.id,
  licenseKey,
  userId: deviceUserId,
}).catch((err) => {
  log.warn("pointer_write_failed", "Opportunistic pointer write failed (non-fatal)", {
    fingerprint: fingerprint.substring(0, 8) + "...",
    error: err.message,
  });
});
```

This is a fire-and-forget PutItem — it does not block the heartbeat response. The pointer is idempotent (PutItem overwrites), so repeated writes are safe but wasteful. A conditional write (`attribute_not_exists(PK)`) can be added as an optimization, but the cost of an unconditional PutItem every 10 minutes per device is negligible.

**Design note:** The pointer is written in the heartbeat route rather than the activate route to avoid modifying the fully-functioning activation path. The first heartbeat (triggered at L232 of the activate route) fires within seconds of activation, so the pointer is available almost immediately.

### 4.3 Dead Code Removal — `recordTrialHeartbeat` References

**Files to update:**

1. **`plg-website/src/app/api/license/heartbeat/route.js`** — Remove `recordTrialHeartbeat` import (line 24).
2. **`plg-website/src/lib/dynamodb.js`** — Remove `recordTrialHeartbeat` function (lines 1278-1310).
3. **Test files** — Remove or update tests that reference the trial heartbeat path:
   - `__tests__/unit/api/heartbeat.test.js` — "trial heartbeat" test group (~lines 231-248)
   - `__tests__/unit/api/heartbeat-route.contract.test.js` — trial heartbeat contract test (~line 104)
   - `__tests__/unit/lib/dynamodb.test.js` — any `recordTrialHeartbeat` tests
   - `__tests__/e2e/verify-logging-wireup.js` — trial heartbeat logging reference (~line 108)
   - `__tests__/e2e/journeys/j3-license-activation.test.js` — trial heartbeat journey reference (~line 244)

---

## 5. Tests

### 5.1 Unit Tests — New and Updated

#### DynamoDB pointer operations (new)

**File:** `__tests__/unit/lib/dynamodb.test.js` (expand existing)

| Test                                                             | Assertion                                                                                  |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `putDevicePointer` writes correct PK/SK                          | PK = `DEVICE_FP#${fp}`, SK = `POINTER`, contains `keygenLicenseId`, `licenseKey`, `userId` |
| `getDevicePointer` returns record for known fingerprint          | Returns object with `keygenLicenseId`, `licenseKey`                                        |
| `getDevicePointer` returns null for unknown fingerprint          | Returns `null`                                                                             |

#### Heartbeat route — fingerprint resolution (new)

**File:** `__tests__/unit/api/heartbeat.test.js` (expand existing) or `__tests__/unit/api/heartbeat-route.contract.test.js`

| Test                                                                 | Assertion                                                                     |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Fingerprint-only heartbeat resolves via pointer                      | When licenseKey absent, pointer found → same response as direct-key heartbeat |
| Fingerprint-only heartbeat returns machine_not_found when no pointer | No pointer record → `{ valid: false, status: "machine_not_found" }`           |
| Direct licenseKey heartbeat still works (no regression)              | Existing behavior unchanged when licenseKey is present                        |
| Rate limiting uses fingerprint when licenseKey absent                | Rate limit identifier falls back to fingerprint                               |

#### Heartbeat route — status passthrough (new)

| Test                                                          | Assertion                                                                          |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Active license returns `status: "active"`                     | license.status = "active" → response status = "active"                             |
| Past-due license returns `status: "past_due"`                 | license.status = "past_due" → response status = "past_due"                         |
| Cancellation-pending returns `status: "cancellation_pending"` | license.status = "cancellation_pending" → response status = "cancellation_pending" |

#### Dead code removal verification

| Test                                         | Assertion                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------- |
| No trial heartbeat path exists               | Heartbeat with no licenseKey and no pointer → `machine_not_found` (not `trial`) |
| `recordTrialHeartbeat` not imported in route | Grep/import verification                                                        |

#### Heartbeat route — opportunistic pointer write (new)

| Test                                                               | Assertion                                                                               |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Heartbeat with licenseKey writes device pointer                    | After heartbeat, `getDevicePointer(fingerprint)` returns pointer with correct data      |
| Pointer write failure does not affect heartbeat response            | If `putDevicePointer` throws, heartbeat still returns success                           |
| Fingerprint-only heartbeat after pointer write resolves correctly  | First heartbeat (with key) + second (without key) → same `valid: true` result           |

### 5.2 Property Tests — New

#### Property 23: Fingerprint-based heartbeat equivalence

**Tag:** `// Feature: status-remediation-plan, Property 23`

**Property:** For any device with a valid pointer record, a heartbeat sent without `licenseKey` must produce the same `{ valid, status }` response as a heartbeat sent with the correct `licenseKey`.

| Sub-test                           | Iterations | Assertion                                  |
| ---------------------------------- | ---------- | ------------------------------------------ |
| Active license, fingerprint-only   | 100        | Same response as direct-key                |
| Past-due license, fingerprint-only | 100        | Same response as direct-key                |
| Expired license, fingerprint-only  | 100        | Same `{ valid: false, status: "expired" }` |

#### Property 24: Heartbeat status passthrough

**Tag:** `// Feature: status-remediation-plan, Property 24`

**Property:** For any license with status in `{active, past_due, cancellation_pending}`, the heartbeat success response's `status` field must equal `license.status` (not hardcoded `"active"`).

| Sub-test                          | Iterations | Assertion                                  |
| --------------------------------- | ---------- | ------------------------------------------ |
| Random valid status               | 100        | Response status === license.status         |
| past_due specifically             | 100        | Response status === "past_due"             |
| cancellation_pending specifically | 100        | Response status === "cancellation_pending" |

#### Property 25: Opportunistic pointer write consistency

**Tag:** `// Feature: status-remediation-plan, Property 25`

**Property:** For any licensed heartbeat where `licenseKey` is present, the device pointer must exist after the heartbeat completes. A subsequent fingerprint-only heartbeat (same device, no `licenseKey`) must resolve to the same license.

---

## 6. Staging Deployment

### 6.1 Build and Publish `hic-ses-layer`

The `licenseSuspended` email template was removed in Phase 1 Fix 5 (Task 6.8). The SES layer currently published (v0.2.8) predates this change. The layer must be rebuilt and republished to incorporate the template removal.

```bash
# From repo root:
cd dm/layers/ses

# Bump version in version.manifest.json (0.2.8 → 0.2.9)
# Then build and publish:
bash build.sh
bash publish.sh
```

### 6.2 Deploy Lambda Functions

```bash
cd plg-website/infrastructure
bash update-lambdas.sh staging
```

This will:

1. Package each Lambda function's code
2. Discover the latest layer versions (including the new SES layer)
3. Update each Lambda's code and layer configuration
4. Verify deployment success

### 6.3 Deploy Next.js Application

The heartbeat route changes ship as part of the Next.js application deployed via Amplify. After pushing to `development`, Amplify will auto-build and deploy to the staging environment.

---

## 7. Final Checkpoints

### Task 16: Production Configuration (Manual — SWR)

Prior to the final checkpoint:

- **16.1:** Configure Stripe Smart Retries — maximum 8 retries over 2-week maximum duration, subscription cancellation after all retries fail.
- **16.2:** Configure Keygen policy durations — Monthly: 44 days (3,801,600s), Annual: 379 days (32,745,600s).

### Task 17: Final Checkpoint

- Run the full test suite (PLG + DM) and verify all tests pass
- Verify test coverage meets >80% threshold
- Confirm all 22+ properties pass
- Verify staging deployment is operational

---

## 8. Execution Order

Phase 3 work should be executed in this order:

1. **DynamoDB module changes** (Section 4.1) — Pointer record functions, `recordTrialHeartbeat` removal
2. **Heartbeat route overhaul** (Section 4.2) — Fingerprint resolution, opportunistic pointer write, status passthrough, trial code removal
3. **Dead code removal** (Section 4.3) — Remove trial heartbeat test references
4. **Test updates** (Section 5) — Remove dead trial heartbeat tests, add pointer/resolution/passthrough tests
5. **Run full test suite** — Verify no regressions
6. **SES layer build and publish** (Section 6.1)
7. **Lambda deployment** (Section 6.2)
8. **Push to development** — Triggers Amplify staging deployment (Section 6.3)
9. **Task 16** — Stripe/Keygen dashboard configuration (SWR manual)
10. **Task 17** — Final checkpoint

---

## 9. Design Decisions

### D1. Pointer Record over GSI

See Section 1 for full analysis. The pointer record (`DEVICE_FP#${fingerprint}/POINTER`) provides the simplest, safest, most deployable solution with zero infrastructure changes.

### D2. Remove Trial Heartbeat Code

The trial heartbeat path is dead code — the extension never sends trial heartbeats (two independent guards: `extension.js` L132, `heartbeat.js` L81-84). Removing it:

- Eliminates confusion about which states are reachable at the heartbeat API level
- Simplifies the `!licenseKey` branch to have exactly one meaning (fingerprint-based device resolution)
- Removes the `recordTrialHeartbeat` function and `TRIAL#{fp}/HEARTBEAT` DDB pattern
- Does NOT affect `TRIAL#{fp}/TRIAL` records used by `/api/license/validate` for trial token management

If trial-device analytics are desired post-launch, the extension would be modified to emit heartbeats pre-activation. The server would detect trial devices by the absence of a device pointer: fingerprint present + no pointer = trial device. This is cleaner than the current code because the trial/licensed distinction would be an explicit, verifiable condition rather than a convention.

### D3. Opportunistic Pointer Write in Heartbeat Route

The pointer is written as a fire-and-forget side effect of a successful licensed heartbeat (when `licenseKey` IS present). This avoids modifying the fully-functioning activation and deactivation paths. The first heartbeat fires within seconds of activation (triggered at L232 of the activate route), so the pointer is available almost immediately. Stale pointers after device deactivation are harmless — they resolve to a non-existent device record, and the heartbeat returns `machine_not_found`. Self-correcting, no cleanup needed, no data integrity risk.

### D4. `let` Destructuring for `licenseKey`

The heartbeat route destructures `licenseKey` from the request body. Because the fingerprint resolution path reassigns `licenseKey` (the resolved key from the pointer), the destructuring changes from `const` to `let`. This is the minimal change to support both code paths converging into the common licensed-user flow.

### D5. Rate Limit Fallback to Fingerprint

The current rate limiter identifies requests by `body.licenseKey`. Fingerprint-resolved heartbeats have `licenseKey: null` in the request. Changing to `body.licenseKey || body.fingerprint` ensures rate limiting remains effective for all heartbeat paths.

### D6. Status Passthrough Uses `license.status` Directly

The success response changes from hardcoded `"active"` to `license.status`. This is safe because:

- The INVALID_STATUSES gate (expired/suspended/revoked) already returns `{ valid: false }` before reaching the success path
- Only valid statuses (`active`, `past_due`, `cancellation_pending`) reach the success response
- The extension's `VALID_HEARTBEAT_STATUSES` (updated in Phase 2) accepts all three

---

## 10. `tasks.md` Updates Required

The following items need to be added to the tasks.md checklist:

### New Phase 3 tasks (to be inserted after Task 15):

```
- [ ] P3.1. Implement fingerprint-based device resolution in heartbeat route
  - [ ] P3.1.1 Add putDevicePointer and getDevicePointer to dynamodb.js
  - [ ] P3.1.2 Replace trial heartbeat branch with fingerprint resolution in heartbeat route
  - [ ] P3.1.3 Add opportunistic pointer write in heartbeat route (fire-and-forget)
  - [ ] P3.1.4 Update rate limiter to fallback to fingerprint identifier
  - [ ] P3.1.5 Remove recordTrialHeartbeat from dynamodb.js

- [ ] P3.2. Fix heartbeat status passthrough
  - [ ] P3.2.1 Change success response from status: "active" to status: license.status
  - [ ] P3.2.2 Update log line to reflect actual status

- [ ] P3.3. Remove dead trial heartbeat code and tests
  - [ ] P3.3.1 Remove recordTrialHeartbeat import from heartbeat route
  - [ ] P3.3.2 Remove/update trial heartbeat test cases
  - [ ] P3.3.3 Remove recordTrialHeartbeat tests from dynamodb tests

- [ ] P3.4. Write tests for fingerprint resolution and status passthrough
  - [ ] P3.4.1 Unit tests for pointer record CRUD
  - [ ] P3.4.2 Unit tests for fingerprint-based heartbeat resolution
  - [ ] P3.4.3 Unit tests for status passthrough (active, past_due, cancellation_pending)
  - [ ] P3.4.4 Unit tests for opportunistic pointer write in heartbeat route
  - [ ] P3.4.5 Property 23: Fingerprint-based heartbeat equivalence
  - [ ] P3.4.6 Property 24: Heartbeat status passthrough
  - [ ] P3.4.7 Property 25: Opportunistic pointer write consistency

- [ ] P3.5. Checkpoint — Phase 3 implementation complete
  - Run full test suite, verify no regressions

- [ ] P3.6. Staging deployment
  - [ ] P3.6.1 Build and publish hic-ses-layer (version bump to 0.2.9)
  - [ ] P3.6.2 Run update-lambdas.sh staging
  - [ ] P3.6.3 Push to development (triggers Amplify staging deploy)
```

Tasks 16, 16.1, 16.2, and 17 remain as-is (already in the checklist).

---

## 11. Security Considerations

| Concern                                    | Mitigation                                                                                                                                                                                                                                                                   |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fingerprint enumeration**                | The pointer record only exists when a device has completed the authenticated activation flow (browser-based auth code flow with Cognito). A random fingerprint resolves to nothing — returns `machine_not_found`. No information leakage about whether a fingerprint exists. |
| **License key exposure**                   | The license key stored in the pointer record is never returned in the heartbeat response. It's used server-side only to look up the license record. The API never echoes it back.                                                                                            |
| **Stale pointer after deactivation**       | No explicit cleanup. The stale pointer resolves to a device record that no longer exists → `machine_not_found`. Self-correcting.                                                                                                   |
| **Race condition: activation + heartbeat** | The pointer is written opportunistically on the first successful heartbeat (when licenseKey IS present). No race condition — the heartbeat succeeds via the provided key and writes the pointer as a fire-and-forget side effect.                                                                             |
| **Rate limiting bypass**                   | Fingerprint is used as the rate limit key when licenseKey is absent. Both identifiers are per-device, so rate limiting effectiveness is preserved.                                                                                                                           |

---

## 12. Traceability

| Phase 3 Task                | `tasks.md` Task              | requirements.md                           |
| --------------------------- | ---------------------------- | ----------------------------------------- |
| P3.1 Fingerprint resolution | NEW                          | Extends Req 7 (heartbeat)                 |
| P3.2 Status passthrough     | NEW                          | Completes Req 7.4 (past_due valid)        |
| P3.3 Trial code removal     | NEW                          | Codebase hygiene                          |
| P3.4 Tests                  | NEW                          | Req 13 (test coverage), 14.2 (test gates) |
| P3.5 Checkpoint             | Maps to Task 17 precondition | Req 14.2                                  |
| P3.6 Staging deployment     | NEW                          | Operational                               |
| Task 16                     | Existing                     | Req 12                                    |
| Task 17                     | Existing                     | Req 14.3                                  |

---

_End of memo._
