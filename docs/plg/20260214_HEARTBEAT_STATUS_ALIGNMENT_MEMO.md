# Heartbeat Status Alignment Memo

**Date:** 2026-02-14  
**Author:** GitHub Copilot (GPT-5.3-Codex)  
**Scope:** Status-code alignment between PLG back-end heartbeat responses and extension-side heartbeat validation/handling.

---

## 1) Executive Summary

There is a real status-contract mismatch between the back-end heartbeat endpoint and the extension's current heartbeat allow-list/handler logic.

- The core licensed happy-path (`status: "active"`) works, which is consistent with recent successful E2E runs.
- Several non-active statuses are currently misaligned and may be downgraded to generic error behavior by the extension.
- This mismatch is most likely to impact non-happy-path journeys (especially concurrent-limit and some recovery/failure states), not normal paid activation.

Given current business priorities (avoid any regression on paid-user activation/success path), the safest fix is a **minimal extension-side compatibility update first**, with optional server-side cleanup only if needed later.

---

## 2) What the Back-End Currently Returns (Heartbeat)

From [plg-website/src/app/api/license/heartbeat/route.js](plg-website/src/app/api/license/heartbeat/route.js):

- `trial`
- `invalid`
- `machine_not_found`
- `active`
- `over_limit`
- `error`

Observed in code at these response branches:

- `status: "trial"` ([route.js](plg-website/src/app/api/license/heartbeat/route.js#L134))
- `status: "invalid"` ([route.js](plg-website/src/app/api/license/heartbeat/route.js#L201))
- `status: "machine_not_found"` ([route.js](plg-website/src/app/api/license/heartbeat/route.js#L217))
- `status: "active"` ([route.js](plg-website/src/app/api/license/heartbeat/route.js#L234))
- `status: "over_limit"` ([route.js](plg-website/src/app/api/license/heartbeat/route.js#L287), [route.js](plg-website/src/app/api/license/heartbeat/route.js#L299))
- `status: "error"` ([route.js](plg-website/src/app/api/license/heartbeat/route.js#L335))

---

## 3) What the Extension Currently Allows/Handles

### 3.1 Allow-list validator

From [.hic/licensing/validation.js](.hic/licensing/validation.js#L18-L26), `VALID_HEARTBEAT_STATUSES` currently allows:

- `active`
- `license_expired`
- `license_suspended`
- `license_revoked`
- `concurrent_limit`
- `valid`
- `invalid`

### 3.2 Runtime heartbeat handler switch

From [.hic/licensing/heartbeat.js](.hic/licensing/heartbeat.js#L194-L230), handler cases include:

- `active`, `valid`, `trial`
- `license_expired`, `license_suspended`, `license_revoked`
- `device_limit_exceeded`, `concurrent_limit`

### 3.3 Validation gate behavior

From [.hic/licensing/http-client.js](.hic/licensing/http-client.js#L195-L207), if response status is not in allow-list:

- Extension logs invalid heartbeat response
- Returns fallback `{ valid: false, status: "error", reason: "Invalid server response" }`

---

## 4) Confirmed Mismatch Set

### Back-end statuses not in extension allow-list

- `trial`
- `machine_not_found`
- `over_limit`
- `error`

### Extension statuses not emitted by current back-end heartbeat route

- `license_expired`
- `license_suspended`
- `license_revoked`
- `concurrent_limit`
- `valid`
- `device_limit_exceeded` (handler case only)

### Most consequential mismatch

- Back-end uses `over_limit`, but extension is keyed for `concurrent_limit`/`device_limit_exceeded` in handling.

This is exactly the type of mismatch that can leave non-active branches under-tested and inconsistently handled, while happy-path remains fine.

---

## 5) Business-Risk Framing

Your stated priority is correct and practical:

1. **Highest risk (must avoid):** paid user cannot successfully use Mouse.
2. **Lower risk (acceptable short-term):** unpaid/expired edge case occasionally not enforced perfectly.

Current situation supports this priority:

- Paid activation and active heartbeat flows are functioning.
- Contract gaps mainly threaten non-happy-path behavior (limits, lifecycle/recovery edge states), which should still be fixed to avoid support surprises.

---

## 6) Phase 0: Logging & Observability Gate (Must Pass Before Code Changes)

Before any fix is applied, validate and/or add logging so we can prove behavior and quickly rollback if needed.

### 6.1 Logging that must exist (or be added first)

**Back-end (`hic-ai-inc.github.io` / `plg-website`)**

1. Heartbeat request classification log (licensed path):
   - include status decision inputs only (no secrets)
   - fields: `hasAuthorizationHeader`, `hasBearerToken`, `hasSessionId`, `hasFingerprint`, selected response `status`
2. Heartbeat response status log:
   - one structured log line before each non-2xx or non-`active` status return
   - fields: `status`, `reasonCode` (or equivalent), `licenseScoped` boolean
3. Auth verification failure logs:
   - missing header
   - malformed header
   - token verification failure

**Extension (`~/source/repos/hic`)**

1. Heartbeat raw status received from server (before validation mapping)
2. Validation rejection log including unknown status value
3. Post-mapping effective status + action selected by heartbeat state machine

### 6.2 Phase 0 validation checkpoint

Run one controlled pass and confirm logs for at least:
- `active` heartbeat
- one non-active heartbeat (synthetic or test harness), ideally `over_limit` or `machine_not_found`
- one auth-rejection (`401`) scenario

**Exit criteria for Phase 0:** logs are present and queryable in both systems before functional edits begin.

---

## 7) Surgical Changes in Other Repo First (`~/source/repos/hic`)

This repo should change first because it is the consumer of back-end statuses and this is the lowest-risk path to preserve current paid-user success behavior.

### 7.1 Files and exact intent

1. `licensing/validation.js`
   - expand `VALID_HEARTBEAT_STATUSES` to include currently emitted back-end statuses:
     - add: `trial`, `machine_not_found`, `over_limit`, `error`
   - retain current legacy values for compatibility until deprecation decision is finalized.

2. `licensing/heartbeat.js`
   - add `over_limit` alias handling equivalent to existing concurrent-limit path
   - explicitly handle `machine_not_found` with deterministic behavior (no silent downgrade)
   - keep existing `active` path unchanged

3. Tests in `licensing/tests/heartbeat.test.js` and `licensing/tests/http-client.test.js`
   - assert validator accepts all statuses emitted by current back-end heartbeat route
   - assert `over_limit` behavior matches existing concurrent-limit intent
   - assert unknown status still fails safely

### 7.2 Checkpoint after other-repo changes

- Run licensing + VS Code extension test suites in `~/source/repos/hic`
- Execute a local/manual smoke run:
  - licensed user heartbeat remains stable (`active` path unchanged)
  - at least one synthetic non-active status path shows expected mapping/action
- Confirm logging from Phase 0 still emits expected diagnostics

**Do not proceed to server changes unless this checkpoint is green.**

---

## 8) Surgical Changes in This Repo Second (`hic-ai-inc.github.io`)

After extension compatibility is in place, apply minimal server-side normalization only if still needed.

### 8.1 Minimal server-side options (ordered by safety)

**Option A (recommended immediate):**
- no status-string changes
- keep current heartbeat statuses as-is
- add/update tests and docs to lock current contract

**Option B (later cleanup):**
- introduce aliased status compatibility layer or controlled renaming strategy
- only after telemetry proves no impact to active users

### 8.2 Files to touch (if Option A)

1. `plg-website/src/app/api/license/heartbeat/route.js`
   - keep responses unchanged
   - ensure explicit structured logs for each non-active branch

2. `plg-website/__tests__/unit/api/heartbeat.test.js`
   - add contract test asserting emitted status set
   - add tests for any branch that was previously inferred but unasserted

3. Documentation (this memo + Phase 4 checklist docs)
   - state current contract and parity expectations explicitly

### 8.3 Checkpoint after this-repo changes

- `npm run test` (or targeted API suite + full suite)
- CI passes on development
- staging smoke:
  - paid activation and licensed heartbeat still succeed
  - portal/device behavior unchanged for happy path
- confirm Phase 0 logs capture non-active branches and no silent fallback regressions

---

## 9) Definition of Done for This Fix

Mark the heartbeat-alignment fix complete only when all are true:

1. **Observability gate passed**
   - required logs exist and are validated in both repos

2. **Extension compatibility landed first**
   - allow-list accepts current back-end heartbeat statuses
   - runtime maps `over_limit` and handles `machine_not_found` deterministically
   - test coverage added for contract parity and fallback safety

3. **Server side verified (minimal changes)**
   - no regression to paid-user active flow
   - status contract tests pass
   - CI/CD green

4. **Staging validation complete**
   - `Mouse: Enter License Key` succeeds for paid path
   - licensed status remains stable in extension + portal
   - at least one non-active branch exercised and observed in logs

5. **Rollback readiness**
   - previous extension package/version identifiable
   - server deployment rollback path documented and tested at least once in dry-run form

---

## 10) Optional Post-Ship Cleanup

After stable shipping and telemetry confidence:

- Consolidate to a single canonical status vocabulary (deprecate legacy aliases)
- Introduce shared status constants/contract package or generated contract tests across repos
- Expand payment-failure/suspension/revocation E2E scenarios

---

## 11) Suggested Decision

Proceed with the phased plan above:
1. Phase 0 logging gate,
2. extension repo compatibility patch,
3. this-repo minimal hardening/tests,
4. staged validation checkpoints.

This sequence minimizes risk to currently working paid-user flows while closing obvious mismatch risk in non-happy-path handling.
