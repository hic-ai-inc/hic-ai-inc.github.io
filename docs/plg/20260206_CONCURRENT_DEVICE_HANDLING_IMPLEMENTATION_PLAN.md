# Concurrent Device Handling Implementation Plan

**Date**: 2026-02-06  
**Author**: Q Developer  
**Status**: Draft for Review  
**Related**: PLG Technical Specification v2, Device Validation User Journey

---

## Executive Summary

This document outlines a comprehensive fix for concurrent device limit enforcement in the Mouse licensing system. The current implementation blocks users from activating devices when limits are exceeded, which contradicts the business goal of encouraging usage while monetizing heavy concurrent usage. The proposed solution implements time-based concurrent device tracking with soft warnings instead of hard blocks.

---

## 1. Background: Current Implementation

### 1.1 Device Registration Flow

**Device Activation** (`/api/license/activate`):
- Uses `fingerprint` as deduplication key
- Creates `DEVICE#` record in DynamoDB
- Increments `activatedDevices` counter (never decrements)
- **Blocks activation** with 403 error if `activatedDevices >= maxMachines`

**Device Heartbeat** (`/api/license/heartbeat`):
- Updates `lastSeenAt` timestamp via `updateDeviceLastSeen()`
- Checks concurrent count via Keygen's `getLicenseMachines()` API
- Returns soft warning if `concurrentMachines > maxMachines`

**Portal Display** (`/portal/devices`):
- Fetches all devices via `getLicenseDevices()`
- Filters by `lastSeen` within 7 days for display
- Shows `activeDevices.length / maxDevices`

### 1.2 The Three Device Counts Problem

The system currently tracks devices in three inconsistent ways:

1. **`activatedDevices` counter** (DynamoDB `LICENSE#/DETAILS`) - Cumulative total, never decrements
2. **Portal display** (filtered by 7-day window) - Shows correct concurrent count
3. **Heartbeat enforcement** (Keygen API) - Returns all machines ever activated

### 1.3 Current Limit Configuration

From `plg-website/src/lib/constants.js`:
- **Individual**: `maxConcurrentMachines: 3`
- **Business**: `maxConcurrentMachinesPerSeat: 5`

---

## 2. The Problem: What We Actually Want

### 2.1 Business Goals

1. **Encourage usage everywhere** - Users should be able to install Mouse on any device
2. **Monetize heavy concurrent usage** - Capture users running multi-agent workflows (5-10+ concurrent containers)
3. **Avoid punishing normal usage** - Laptop + desktop + occasional container should never hit limits
4. **Soft warnings, not hard blocks** - Nag users to upgrade, don't prevent them from working

### 2.2 Target User Segments

**Normal Developer** (should never hit limit):
- Laptop + desktop + occasional container
- Devices used on different days
- Expected concurrent: 1-2 devices

**Container Experimenter** (should be fine):
- New container daily, old ones unused
- Only 1-2 containers active at once
- Expected concurrent: 2-3 devices

**Agent Farm Operator** (should contact sales):
- 5-10+ containers running simultaneously
- Heavy API usage, multiple concurrent sessions
- Expected concurrent: 5+ devices

### 2.3 Current Behavior vs. Desired Behavior

| Scenario | Current Behavior | Desired Behavior |
|----------|------------------|------------------|
| User activates 4th device (over limit) | **403 Forbidden** - activation blocked | **200 OK** - activation succeeds with `overLimit: true` flag |
| User with 4 devices, 3 inactive | Shows 4 devices, blocks 5th | Shows 1-2 active devices, allows 5th |
| Container unused for 24 hours | Still counts against limit | Automatically drops off concurrent count |
| Heartbeat from over-limit device | Returns `valid: false` warning | Returns `valid: true` with `overLimit: true` flag |

---

## 3. Proposed Solution: Time-Based Concurrent Device Tracking

### 3.1 Core Concept

**Concurrent Device Window**: A device counts against the limit ONLY if it has sent a heartbeat within the last 24 hours.

**Why 24 hours?**
- Captures true concurrent usage (multiple active sessions same day)
- Container from yesterday that's unused today = doesn't count
- Normal multi-device workflow: work on laptop today, desktop tomorrow = max 1-2 concurrent
- Agent farm: 10 containers running simultaneously = hits limit immediately
- Natural cleanup: inactive devices automatically drop off next day

### 3.2 Configuration

Add environment variable for tuning without code changes:

```bash
# .env
CONCURRENT_DEVICE_WINDOW_HOURS=24  # Default: 24 hours
```

### 3.3 Implementation Changes in This Repo

#### Change 1: Add Time-Based Active Device Helper

**File**: `plg-website/src/lib/dynamodb.js`

Add new function after `getLicenseDevices()`:

```javascript
/**
 * Get active devices within concurrent window
 * @param {string} keygenLicenseId - License ID
 * @param {number} windowHours - Hours to consider device active (default: 24)
 * @returns {Promise<Array>} Active devices within window
 */
export async function getActiveDevicesInWindow(keygenLicenseId, windowHours = 24) {
  const devices = await getLicenseDevices(keygenLicenseId);
  const cutoffTime = new Date(Date.now() - windowHours * 60 * 60 * 1000);
  
  return devices.filter(device => {
    const lastActivity = new Date(device.lastSeenAt || device.createdAt);
    return lastActivity > cutoffTime;
  });
}
```

#### Change 2: Remove Hard Block from Activation Endpoint

**File**: `plg-website/src/app/api/license/activate/route.js`

**Current code** (lines 95-109):
```javascript
// Check if device limit reached (if maxMachines is set)
if (license.maxMachines) {
  const dynamoLicense = await getDynamoLicense(license.id);
  if (
    dynamoLicense &&
    dynamoLicense.activatedDevices >= license.maxMachines
  ) {
    return NextResponse.json(
      {
        error: "Device limit reached",
        code: "DEVICE_LIMIT_REACHED",
        detail: `Maximum ${license.maxMachines} devices allowed. Please deactivate a device first.`,
        maxDevices: license.maxMachines,
        activatedDevices: dynamoLicense.activatedDevices,
      },
      { status: 403 },
    );
  }
}
```

**Replace with**:
```javascript
// Check concurrent device count (24-hour window)
const windowHours = parseInt(process.env.CONCURRENT_DEVICE_WINDOW_HOURS) || 24;
const activeDevices = await getActiveDevicesInWindow(license.id, windowHours);
const overLimit = license.maxMachines && activeDevices.length >= license.maxMachines;
```

**Update success response** (after line 145):
```javascript
return NextResponse.json({
  success: true,
  activated: true,
  activationId: machine.id,
  deviceCount: activeDevices.length,  // Active devices in window
  maxDevices: license.maxMachines,
  overLimit: overLimit,  // NEW: Flag for client-side nag banner
  message: overLimit 
    ? `You're using ${activeDevices.length} of ${license.maxMachines} allowed devices. Consider upgrading for more concurrent devices.`
    : null,
  machine: {
    id: machine.id,
    name: machine.name,
    fingerprint: machine.fingerprint,
  },
  license: {
    id: license.id,
    status: license.status,
    expiresAt: license.expiresAt,
  },
});
```

#### Change 3: Update Heartbeat to Use Time-Based Logic

**File**: `plg-website/src/app/api/license/heartbeat/route.js`

**Current code** (lines 214-224):
```javascript
// Get current machine count for concurrent device info
let concurrentMachines = 1;
let maxMachines = license.maxDevices || null;

if (license.keygenLicenseId) {
  try {
    const machines = await getLicenseMachines(license.keygenLicenseId);
    concurrentMachines = machines.length;
  } catch (err) {
    // Non-critical - continue with default
    console.error("Failed to fetch machine count:", err);
  }
}
```

**Replace with**:
```javascript
// Get active device count using time-based window
const windowHours = parseInt(process.env.CONCURRENT_DEVICE_WINDOW_HOURS) || 24;
let concurrentMachines = 1;
let maxMachines = license.maxDevices || null;

if (license.keygenLicenseId) {
  try {
    const activeDevices = await getActiveDevicesInWindow(license.keygenLicenseId, windowHours);
    concurrentMachines = activeDevices.length;
  } catch (err) {
    console.error("Failed to fetch active device count:", err);
  }
}
```

**Update limit check** (lines 226-233):
```javascript
// Check if device limit exceeded (for concurrent device enforcement)
const overLimit = maxMachines && concurrentMachines > maxMachines;

if (overLimit) {
  return NextResponse.json({
    valid: true,  // CHANGED: Still valid, just over limit
    status: "over_limit",  // CHANGED: New status
    reason: `You're using ${concurrentMachines} of ${maxMachines} allowed devices`,
    concurrentMachines,
    maxMachines,
    message: "Consider upgrading your plan for more concurrent devices.",
  });
}
```

#### Change 4: Add `overLimit` Flag to Success Response

**File**: `plg-website/src/app/api/license/heartbeat/route.js`

**Update success response** (lines 240-252):
```javascript
return NextResponse.json(
  {
    valid: true,
    status: overLimit ? "over_limit" : "active",  // NEW: Indicate over-limit state
    reason: "Heartbeat successful",
    concurrentMachines,
    maxMachines,
    overLimit: overLimit,  // NEW: Flag for client-side nag banner
    message: overLimit 
      ? `You're using ${concurrentMachines} of ${maxMachines} allowed devices. Consider upgrading.`
      : null,
    nextHeartbeat: 900,
    // Auto-update fields (B2)
    latestVersion: versionConfig?.latestVersion || null,
    releaseNotesUrl: versionConfig?.releaseNotesUrl || null,
    updateUrl: versionConfig?.updateUrl?.marketplace || null,
    // Daily-gated notification fields
    readyVersion: versionConfig?.readyVersion || null,
    readyReleaseNotesUrl: versionConfig?.readyReleaseNotesUrl || null,
    readyUpdateUrl: versionConfig?.readyUpdateUrl || null,
    readyUpdatedAt: versionConfig?.readyUpdatedAt || null,
  },
  { headers: rateLimitHeaders },
);
```

### 3.4 Portal Display Update (Optional)

**File**: `plg-website/src/app/portal/devices/page.js`

The portal already filters by 7-day window (line 67). Consider updating to match the 24-hour window for consistency:

```javascript
// Current: 7-day window
const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

// Proposed: Use same window as enforcement
const windowHours = 24; // Or read from config
const cutoffTime = new Date(Date.now() - windowHours * 60 * 60 * 1000);
```

**Recommendation**: Keep 7-day display window for user visibility (shows recent devices), but use 24-hour window for limit enforcement. This gives users transparency into what devices have been used recently while enforcing stricter concurrent limits.

---

## 4. Client-Side Implementation Recommendations

### 4.1 General Approach (for `~/source/repos/hic` repo)

The VS Code extension should handle the new `overLimit` flag gracefully:

**Activation Flow**:
1. Call `/api/license/activate` with license key + fingerprint
2. Check response for `overLimit: true` flag
3. If `overLimit === true`:
   - **Still activate** the license locally (don't block)
   - **Show nag banner** with upgrade message
   - **Store flag** for persistent banner display
4. If `overLimit === false`:
   - Activate normally, no banner

**Heartbeat Flow**:
1. Call `/api/license/heartbeat` every 10 minutes
2. Check response for `overLimit: true` flag
3. If `overLimit === true`:
   - **Continue working** (don't disable features)
   - **Show/update nag banner** with concurrent device count
   - **Provide upgrade link** to pricing page
4. If `overLimit === false`:
   - Hide banner if previously shown

### 4.2 Nag Banner Design Recommendations

**Banner Content**:
```
⚠️ You're using 4 of 3 allowed devices
Your plan includes 3 concurrent devices, but you're currently using 4.
Consider upgrading for more concurrent devices.

[Upgrade Plan] [Learn More] [Dismiss for 24h]
```

**Banner Behavior**:
- Non-blocking (doesn't prevent work)
- Dismissible for 24 hours
- Reappears on next heartbeat if still over limit
- Includes device count and upgrade CTA
- Links to pricing page with pre-selected upgrade tier

### 4.3 Status Code Handling

**Activation Response**:
```typescript
interface ActivationResponse {
  success: boolean;
  activated: boolean;
  activationId: string;
  deviceCount: number;
  maxDevices: number;
  overLimit: boolean;  // NEW
  message: string | null;  // NEW
  machine: { id: string; name: string; fingerprint: string };
  license: { id: string; status: string; expiresAt: string };
}
```

**Heartbeat Response**:
```typescript
interface HeartbeatResponse {
  valid: boolean;
  status: "active" | "over_limit" | "trial" | "error";  // UPDATED
  reason: string;
  concurrentMachines: number;
  maxMachines: number;
  overLimit: boolean;  // NEW
  message: string | null;  // NEW
  nextHeartbeat: number;
  // ... version fields
}
```

### 4.4 Error Handling

**No Breaking Changes**:
- Existing clients without `overLimit` handling will continue to work
- `valid: true` means license is valid (no functional changes)
- `overLimit` is additive information for enhanced UX

**Backward Compatibility**:
- Old clients ignore `overLimit` flag → no banner, but still work
- New clients check `overLimit` flag → show banner, encourage upgrade
- No disruption to existing installations

---

## 5. Testing Plan

### 5.1 Server-Side Tests

**Unit Tests** (`plg-website/__tests__/unit/lib/dynamodb.test.js`):
- `getActiveDevicesInWindow()` with various time windows
- Devices within window vs. outside window
- Empty device list handling

**Integration Tests** (`plg-website/__tests__/integration/`):
- Activation with 0, 1, 2, 3, 4+ devices
- Heartbeat with devices inside/outside window
- Window boundary conditions (exactly 24 hours)

**E2E Tests** (`plg-website/__tests__/e2e/journeys/`):
- Multi-device activation flow
- Container churn scenario (activate, wait 25 hours, activate new)
- Agent farm scenario (5+ concurrent activations)

### 5.2 Client-Side Tests (General Recommendations)

**Activation Tests**:
- Successful activation with `overLimit: false`
- Successful activation with `overLimit: true` (banner shown)
- Banner dismissal and re-appearance

**Heartbeat Tests**:
- Normal heartbeat with `overLimit: false`
- Over-limit heartbeat with `overLimit: true` (banner shown)
- Banner persistence across VS Code restarts

**Edge Cases**:
- Network failure during activation (retry logic)
- Heartbeat timeout (graceful degradation)
- Rapid device switching (multiple activations in short time)

---

## 6. Deployment Strategy

### 6.1 Phased Rollout

**Phase 1: Server-Side Changes** (this repo)
1. Deploy `getActiveDevicesInWindow()` helper
2. Update activation endpoint (remove 403 block)
3. Update heartbeat endpoint (time-based logic)
4. Monitor metrics: activation success rate, over-limit frequency

**Phase 2: Client-Side Changes** (`~/source/repos/hic` repo)
1. Add `overLimit` flag handling
2. Implement nag banner UI
3. Test with staging environment
4. Deploy to production

**Phase 3: Monitoring & Tuning**
1. Track concurrent device distribution
2. Monitor upgrade conversion rate
3. Adjust window (24h → 12h or 48h) if needed
4. Gather user feedback

### 6.2 Rollback Plan

**If Issues Arise**:
1. Revert to 403 blocking behavior (restore old activation code)
2. Set `CONCURRENT_DEVICE_WINDOW_HOURS=168` (7 days) for gradual transition
3. Disable nag banner client-side via feature flag

**Metrics to Monitor**:
- Activation success rate (should increase)
- Support tickets about device limits (should decrease)
- Upgrade conversion rate (should increase)
- API error rates (should remain stable)

---

## 7. Configuration Reference

### 7.1 Environment Variables

```bash
# Concurrent device window (hours)
CONCURRENT_DEVICE_WINDOW_HOURS=24

# DynamoDB table
DYNAMODB_TABLE_NAME=hic-plg-production

# Keygen API
KEYGEN_ACCOUNT_ID=xxx
KEYGEN_API_TOKEN=xxx
```

### 7.2 Constants

**File**: `plg-website/src/lib/constants.js`

```javascript
export const PRICING = {
  individual: {
    maxConcurrentMachines: 3,  // Enforced with 24-hour window
  },
  business: {
    maxConcurrentMachinesPerSeat: 5,  // Enforced with 24-hour window
  },
};
```

---

## 8. Success Metrics

### 8.1 Key Performance Indicators

**User Experience**:
- Activation success rate: Target 100% (up from ~75% with blocking)
- Support tickets about device limits: Target 50% reduction
- User satisfaction (NPS): Target +10 points

**Business Metrics**:
- Upgrade conversion rate: Target 5-10% of over-limit users
- Revenue from concurrent device upgrades: Track monthly
- Agent farm detection: Identify users with 5+ concurrent devices

**Technical Metrics**:
- API error rate: Should remain stable (<0.1%)
- Heartbeat latency: Should remain <200ms
- DynamoDB read/write costs: Monitor for increases

---

## 9. Future Enhancements

### 9.1 Dynamic Window Adjustment

Allow per-plan window configuration:
- Individual: 24-hour window (stricter)
- Business: 48-hour window (more generous)
- Enterprise: Custom window per contract

### 9.2 Grace Period

Implement grace period before enforcement:
- First 7 days: No limits (onboarding grace)
- Days 8-14: Soft warnings only
- Day 15+: Full enforcement with nag banners

### 9.3 Smart Device Recognition

Detect device types and adjust limits:
- Persistent devices (laptop, desktop): Always count
- Ephemeral devices (containers): Only count if used in last 6 hours
- CI/CD environments: Separate limit pool

---

## 10. Appendix

### 10.1 Related Documents

- PLG Technical Specification v2
- Device Validation User Journey (20260129)
- Pricing v4.2 Feature Matrix (20260126)
- Security Considerations for Keygen Licensing

### 10.2 API Contract Changes

**Breaking Changes**: None

**Additive Changes**:
- Activation response: Added `overLimit` (boolean), `message` (string|null)
- Heartbeat response: Added `overLimit` (boolean), `message` (string|null), updated `status` enum

### 10.3 Database Schema Changes

**No schema changes required**. Existing `lastSeenAt` field is sufficient for time-based filtering.

---

## Approval & Sign-Off

**Prepared by**: Q Developer  
**Reviewed by**: _Pending_  
**Approved by**: _Pending_  
**Implementation Start**: _TBD_  
**Target Completion**: _TBD_

---

**End of Document**
