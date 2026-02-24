# Design Document: Stream 1A Website Heartbeat Fixes

## Status: COMPLETE ✅ (Feb 24, 2026)

## Overview

This design covers 4 surgical improvements to the heartbeat API route and its test suite. The changes are scoped to the Website repo and prepare the server-side contract for the Extension client-side fixes in the main Stream 1A work.

The heartbeat route (`POST /api/license/heartbeat`) returns one of 6 server statuses: `trial`, `active`, `over_limit`, `machine_not_found`, `error`, `invalid`. Each status has a distinct response shape. The fixes address a missing version payload on one path, dead code on another, a test contradiction, and missing contract test coverage.

## Architecture

No architectural changes. All work is within the existing heartbeat route handler and its test files:

```
plg-website/
├── src/app/api/license/heartbeat/
│   └── route.js                              ← Fix 1 (version fields), Fix 3 (dead code)
├── src/lib/
│   └── constants.js                          ← NEXT_HEARTBEAT_SECONDS extraction
└── __tests__/
    ├── unit/api/
    │   └── heartbeat-route.contract.test.js  ← Fix 2 (4 new contract tests)
    ├── integration/
    │   └── heartbeat.test.js                 ← Fix 4 (assertion correction + full alignment)
    └── e2e/
        └── config.js                         ← constant import
```

## Implementation Notes (post-completion)

- `nextHeartbeat` was changed from hardcoded `900` (15 min) to `NEXT_HEARTBEAT_SECONDS = 600` (10 min) extracted to `constants.js`. This matches the Extension client's 10-min interval and sits well within Keygen's 3600s (1 hour) heartbeat window.
- The integration test fix was expanded beyond the original spec scope to achieve full field alignment with the route output: realistic Individual license values (maxDevices: 3, 4 active devices), corrected `reason` string, added `message`, `nextHeartbeat`, and all 7 version fields (as `null`).
- Contract tests use realistic license configurations per SWR feedback: Individual maxDevices: 3, Business maxDevices: 5 per seat.

## Response Shapes (authoritative, post-fix)

### over_limit (UPDATED — now includes version fields + NEXT_HEARTBEAT_SECONDS)
```json
{
  "valid": true,
  "status": "over_limit",
  "reason": "You're using N of M allowed devices",
  "concurrentMachines": "N",
  "maxMachines": "M",
  "message": "Consider upgrading your plan for more concurrent devices.",
  "nextHeartbeat": 600,
  "latestVersion": "...|null",
  "releaseNotesUrl": "...|null",
  "updateUrl": "...|null",
  "readyVersion": "...|null",
  "readyReleaseNotesUrl": "...|null",
  "readyUpdateUrl": "...|null",
  "readyUpdatedAt": "...|null"
}
```

See original design document for all 6 response shapes. The `nextHeartbeat` value is now `600` (was `900`) across all shapes that include it.
