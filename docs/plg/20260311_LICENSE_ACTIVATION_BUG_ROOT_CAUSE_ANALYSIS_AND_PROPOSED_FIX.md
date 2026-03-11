# GC MEMO: License Activation Bug — Root Cause Analysis and Proposed Fix

**Date:** March 11, 2026  
**Author:** GitHub Copilot (GC), at direction of SWR  
**Status:** INVESTIGATION COMPLETE — AWAITING APPROVAL  
**Severity:** P0 — License activation is completely broken in production  
**Affects:** All new license activations via the VS Code extension

---

## 1. Executive Summary

License activation via "Mouse: Enter License Key" hangs at "Activating..." and never completes. The browser-delegated activation flow succeeds on the server side (DynamoDB record written, admin portal shows device as activated), but the extension's polling loop never detects the successful activation and times out after 5 minutes. On window refresh, the extension reverts to trial status.

**Root cause:** The `createLicense()` function in the Website repo's `dynamodb.js` never writes a `GSI2PK` attribute on license records, but `getLicenseByKey()` queries GSI2 for `LICENSE_KEY#<key>`. The query always returns `null`, causing the validate endpoint to respond with `{valid: false, code: "NOT_FOUND"}` for every license key.

**Introduced by:** Commit `bec474d` in the Website repo ("Fix 7: Replace Keygen reads with DDB reads"), which switched the `/api/license/validate` endpoint from Keygen API reads to DynamoDB reads via `getLicenseByKey()`. The function existed but had never been exercised against real data because no license record has ever been written with the required GSI2 index attributes.

---

## 2. Affected Components

### Website Repo (`hic-ai-inc.github.io`)

| File                                                      | Function                      | Issue                                                                                                               |
| --------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `plg-website/src/lib/dynamodb.js` L510–570                | `createLicense()`             | **Missing `GSI2PK: LICENSE_KEY#${licenseKey}`** on license record. GSI2 is never populated for licenses.            |
| `plg-website/src/app/api/license/validate/route.js` L239  | `POST /api/license/validate`  | Calls `getLicenseByKey()` which relies on the missing GSI2 index — always returns `null` → `NOT_FOUND`.             |
| `plg-website/src/app/api/license/heartbeat/route.js` L239 | `POST /api/license/heartbeat` | Also calls `getLicenseByKey()` — **same bug**. Heartbeats for licensed users will also fail to resolve the license. |

### Extension Repo (`hic`)

| File                                     | Function                         | Issue                                                                                                          |
| ---------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `licensing/http-client.js` L138–175      | `pollActivationStatus()`         | No test coverage for the case where validate returns `NOT_FOUND`. Polls silently for 5 minutes then times out. |
| `licensing/commands/activate.js` L82–100 | `activate()` (authStrategy path) | No regression test verifying the end-to-end activation→poll→success contract.                                  |

---

## 3. Detailed Root Cause Analysis

### 3.1. The DynamoDB Schema Gap

The `createLicense()` function writes this item to DynamoDB:

```javascript
const licenseItem = {
  PK: `LICENSE#${keygenLicenseId}`, // ✓ Primary key
  SK: "DETAILS", // ✓ Sort key
  GSI1PK: `USER#${userId}`, // ✓ GSI1 — lookup by user
  GSI1SK: `LICENSE#${keygenLicenseId}`, // ✓ GSI1 sort key
  keygenLicenseId,
  userId,
  licenseKey, // ✓ Stored as attribute
  policyId,
  status,
  // ...
};
```

**Missing from the item:**

```javascript
  GSI2PK: `LICENSE_KEY#${licenseKey}`,    // ✗ NEVER SET
  GSI2SK: `LICENSE#DETAILS`,              // ✗ NEVER SET
```

The `getLicenseByKey()` function queries:

```javascript
IndexName: "GSI2",
KeyConditionExpression: "GSI2PK = :pk",
ExpressionAttributeValues: { ":pk": `LICENSE_KEY#${licenseKey}` }
```

Since no license record has `GSI2PK` set, this query **always returns an empty result set**, and the function returns `null`.

### 3.2. How This Became a Bug

The `getLicenseByKey()` function was added in commit `ba53b2c` (PLG Phase 2B, Jan 23 2026) with the GSI2 query correctly implemented. However, the corresponding write — adding `GSI2PK`/`GSI2SK` to `createLicense()` — was **never implemented**. The function sat unused until commit `bec474d` (Fix 7, Mar 8 2026) wired it into the validate endpoint.

**Timeline:**

1. **Jan 23** — `getLicenseByKey()` added as a TODO resolution. `createLicense()` not updated.
2. **Mar 8** — Fix 7 switches `/api/license/validate` from Keygen reads to DDB reads via `getLicenseByKey()`.
3. **Mar 8** — Heartbeat route also wired to use `getLicenseByKey()`.
4. **Mar 9** — Extension repo Phase 2 status remediation commit (`118082a1`) ships.
5. **Mar 11** — E2E smoke test in `hic-e2e-clean` container reveals activation is broken.

### 3.3. Why Existing Tests Didn't Catch It

1. **Unit tests mock DynamoDB responses.** The `getLicenseByKey()` tests stub the DynamoDB client to return pre-built items that already have `GSI2PK` set. They verify the query logic, not the write/read contract.

2. **E2E journey tests (J3: License Activation)** exercise the `/api/license/activate` endpoint, which uses Keygen's `validateLicense()` (not `getLicenseByKey()`), so activation succeeds. The subsequent polling step was not covered in E2E.

3. **The Extension repo's `pollActivationStatus()` tests** mock `_post()` to return `{valid: true, machineId: "xxx"}`, never testing against a real validate endpoint response.

4. **No cross-repo integration test** verifies that a license created via `createLicense()` can be retrieved via `getLicenseByKey()`.

### 3.4. The Symptom Chain (Detailed)

```
Step  Actor       Action                                    Result
────  ──────────  ────────────────────────────────────────  ─────────────
 1    User        Enters license key in VS Code             Key captured
 2    Extension   Opens browser to /activate?key=X&fp=Y     Browser opens
 3    Browser     User authenticates via Auth0               JWT issued
 4    Website     POST /api/license/activate                 Keygen validateLicense() → FINGERPRINT_SCOPE_MISMATCH
                                                             → activateDevice() → addDeviceActivation() → DDB write ✓
                                                             → machineHeartbeat() ✓
                                                             → Returns {success: true, activationId: "..."}
 5    Browser     Shows "Activation successful" message      User sees success ✓
 6    Extension   Polls POST /api/license/validate           getLicenseByKey(licenseKey) → null
                  every 3s with {licenseKey, fingerprint}    Returns {valid: false, code: "NOT_FOUND"}
 7    Extension   Condition: valid === true && machineId     FALSE — loop continues
 8    Extension   ... repeats polling for 5 minutes ...      100 failed polls
 9    Extension   Poll timeout reached                       Returns {success: false, error: "Activation timed out"}
10    Extension   Shows error or nothing                     User sees "Activating..." stuck
11    User        Reloads VS Code window                     State reloaded from disk — still trial
```

---

## 4. Proposed Fix

### 4.1. Website Repo — Fix 1: Add GSI2 Attributes to `createLicense()`

**File:** `plg-website/src/lib/dynamodb.js`, function `createLicense()`

Add `GSI2PK` and `GSI2SK` to the `licenseItem`:

```javascript
const licenseItem = {
  PK: `LICENSE#${keygenLicenseId}`,
  SK: "DETAILS",
  GSI1PK: `USER#${userId}`,
  GSI1SK: `LICENSE#${keygenLicenseId}`,
  GSI2PK: `LICENSE_KEY#${licenseKey}`, // ← ADD THIS
  GSI2SK: `LICENSE#DETAILS`, // ← ADD THIS
  keygenLicenseId,
  userId,
  licenseKey,
  // ... rest unchanged
};
```

### 4.2. Website Repo — Fix 2: Backfill Existing License Records

Any license already provisioned in DynamoDB (from Stripe webhooks, admin provisioning, etc.) will not have `GSI2PK` set. A one-time migration script must:

1. Scan all records where `PK` begins with `LICENSE#` and `SK = "DETAILS"`
2. For each record with a `licenseKey` attribute but no `GSI2PK`, update:
   - `GSI2PK: LICENSE_KEY#${record.licenseKey}`
   - `GSI2SK: LICENSE#DETAILS`

### 4.3. Website Repo — Fix 3: Add Cross-Function Integration Test

Add a test that:

1. Calls `createLicense()` with test data
2. Calls `getLicenseByKey()` with the same license key
3. Asserts the returned record matches the created record

This prevents future regressions where the write and read paths diverge.

### 4.4. Website Repo — Fix 4: Add `getLicenseByKey()` Guard in Validate Route

Currently, when `getLicenseByKey()` returns `null`, the validate endpoint returns `{valid: false, code: "NOT_FOUND"}` with HTTP 200. Consider adding a logged warning so this failure mode is visible in CloudWatch even if a future schema gap is introduced.

### 4.5. Extension Repo — Fix 5: Add Regression Tests for Poll Failure Modes

Add tests to `licensing/tests/http-client.test.js` for `pollActivationStatus()` that cover:

- Validate returns `{valid: false, code: "NOT_FOUND"}` → poll times out with error
- Validate returns `{valid: true}` but no `machineId` → poll times out (current behavior, should be documented)
- Validate returns `{valid: true, machineId: "xxx"}` → poll succeeds (existing test, keep)

### 4.6. Extension Repo — Fix 6: Add Integration Contract Test for Activate Command

Add a test to `licensing/tests/commands.test.js` that verifies the full `activate()` → `pollActivationStatus()` → state update flow with authStrategy, mocking the HTTP client to simulate the browser-delegated activation lifecycle including the validate response shape.

---

## 5. Execution Order

The fix requires changes in **both repos**, in this order:

| Step  | Repo      | Action                                                                                                                                                                                                              | Depends On                    |
| ----- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| **A** | Extension | Add regression tests (Fixes 5, 6) — these will document the expected behavior and can be written now against the existing code. Tests will verify the extension correctly handles various validate response shapes. | Nothing — can start now       |
| **B** | Website   | Add GSI2 attributes to `createLicense()` (Fix 1)                                                                                                                                                                    | Nothing                       |
| **C** | Website   | Backfill existing license records (Fix 2)                                                                                                                                                                           | Fix 1 deployed                |
| **D** | Website   | Add cross-function integration test (Fix 3)                                                                                                                                                                         | Fix 1                         |
| **E** | Website   | Add `getLicenseByKey()` guard logging (Fix 4)                                                                                                                                                                       | Nothing                       |
| **F** | Both      | End-to-end smoke test in `hic-e2e-clean`                                                                                                                                                                            | Fixes 1–3 deployed to staging |

**Recommendation:** Start with **Step A** (Extension repo tests) now since they are independent and will serve as regression prevention. Then switch to the Website repo for Steps B–E. Return to the Extension repo only if the validate response contract needs adjustment (unlikely — the existing polling logic and response shape are correct; only the server data is missing).

---

## 6. Risk Assessment

| Risk                               | Severity | Mitigation                                                                        |
| ---------------------------------- | -------- | --------------------------------------------------------------------------------- |
| Backfill misses records            | Medium   | Script should verify count before/after; run as idempotent                        |
| GSI2 propagation delay             | Low      | DynamoDB GSI updates are eventually consistent; typically <1s                     |
| Other callers of `createLicense()` | Low      | Only Stripe webhook and admin provisioning routes call it; both pass `licenseKey` |
| Heartbeat also broken              | High     | Fix 1 resolves both validate and heartbeat since both use `getLicenseByKey()`     |

---

## 7. Appendix: Verification Commands

After Fix 1 is deployed and backfill completes, verify from the container:

```bash
# Poll the validate endpoint directly
curl -s -X POST https://staging.hic-ai.com/api/license/validate \
  -H "Content-Type: application/json" \
  -d '{"licenseKey":"<KEY>","fingerprint":"<FP>"}' | jq .

# Expected: {valid: true, code: "VALID", machineId: "...", ...}
# Before fix: {valid: false, code: "NOT_FOUND", ...}
```

---

_End of Memo_
