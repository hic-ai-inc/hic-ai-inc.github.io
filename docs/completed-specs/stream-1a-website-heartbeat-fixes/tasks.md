# Implementation Plan: Stream 1A Website Heartbeat Fixes

## Status: COMPLETE ✅ (Feb 24, 2026)

Merged to `main` at commit `56cbcfc`. CI/CD passed, Amplify deployed to `https://staging.hic-ai.com`.

## Overview

4 surgical fixes to the heartbeat route and its test suite. Each task is independent but ordered so that the route fix (Fix 1) lands before the contract test that pins its new shape (Fix 2). Fix 3 (dead-code cleanup) is done alongside Fix 1 since both touch the same code region. Fix 4 is a one-line assertion correction.

## Tasks

- [x] 1. Add version fields to over_limit response and clean up dead-code ternaries
  - [x] 1.1 Move `getVersionConfig()` call above the `overLimit` early-return branch in `route.js`
  - [x] 1.2 Add all 7 version fields and `nextHeartbeat` to the over_limit response in `route.js`
  - [x] 1.3 Replace dead-code ternaries with constant values in the success response path in `route.js`

- [x] 2. Checkpoint — Verify route.js changes (1,483 tests passing)

- [x] 3. Add contract tests for 4 missing server statuses
  - [x] 3.1 `over_limit` — realistic Individual license (maxDevices: 3, 4 active devices)
  - [x] 3.2 `machine_not_found`
  - [x] 3.3 `error`
  - [x] 3.4 `invalid`

- [x] 4. Fix integration test contradiction
  - [x] 4.1 `valid: false` → `true`, `device_limit_exceeded` → `over_limit`, `reason` corrected, realistic license values, all fields aligned with route output

- [x] 5. Final checkpoint — 1,483 tests passing

## Additional Work (outside original spec scope)

- Extracted `NEXT_HEARTBEAT_SECONDS = 600` to `plg-website/src/lib/constants.js` (shared constant, replaces 4 hardcoded `900` values in route.js + 1 in e2e config)
- Updated `plg-website/__tests__/e2e/config.js` to import from constants

## Files Modified

- `plg-website/src/app/api/license/heartbeat/route.js` — version fields, dead-code cleanup, constant import
- `plg-website/src/lib/constants.js` — added `NEXT_HEARTBEAT_SECONDS`
- `plg-website/__tests__/unit/api/heartbeat-route.contract.test.js` — 4 new contract tests
- `plg-website/__tests__/integration/heartbeat.test.js` — assertion fixes + full field alignment
- `plg-website/__tests__/e2e/config.js` — constant import
