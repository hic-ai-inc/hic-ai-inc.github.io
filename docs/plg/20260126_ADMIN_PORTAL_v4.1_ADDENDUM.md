# Admin Portal v4.1 Addendum: Business Tier & Machine Dashboard

**Date:** January 26, 2026  
**Status:** ✅ APPROVED  
**Affects:** Team Management page, Dashboard terminology

---

## Summary of Portal Changes

| Aspect           | Before (v4)    | After (v4.1)                       |
| ---------------- | -------------- | ---------------------------------- |
| Tier name        | Team           | **Business**                       |
| URL path         | `/portal/team` | `/portal/team` (unchanged for now) |
| Dashboard metric | "Seats used"   | **"Active Machines"**              |
| Member column    | "Devices"      | **"Active Machines"**              |
| Limit display    | "X / Y seats"  | **"X / Y machines"**               |

---

## Dashboard Changes

### Seat Usage Section (Before)

```
┌─────────────────────────────────────────────────────────────┐
│ Seat Usage                                      3 / 5 seats │
│ ████████████████░░░░░░░░░░                                  │
│ 2 seats available. Need more?                               │
└─────────────────────────────────────────────────────────────┘
```

### Machine Usage Section (After)

```
┌─────────────────────────────────────────────────────────────┐
│ Active Machines                              7 / 9 included │
│ ████████████████████████░░░░░░                              │
│ Using 7 of 9 machines (3 seats × 3 each).                   │
│ 2 machine slots available. Need more?                       │
└─────────────────────────────────────────────────────────────┘
```

**Key changes:**

- Shows actual machine count, not just seat count
- Explains the math: `seats × 3 = total machines`
- "Included" language (not "limit") per soft enforcement model

---

## Team Members Table (Before → After)

### Before (v4)

| Member        | Role  | Status | Devices | Actions      |
| ------------- | ----- | ------ | ------- | ------------ |
| Simon Reiff   | Owner | Active | 2 / 2   | —            |
| Alice Johnson | Admin | Active | 1 / 2   | Edit, Remove |

### After (v4.1)

| Member        | Role   | Status | Active Machines | Actions      |
| ------------- | ------ | ------ | --------------- | ------------ |
| Simon Reiff   | Owner  | Active | 2 machines      | —            |
| Alice Johnson | Admin  | Active | 3 machines      | Edit, Remove |
| Bob Smith     | Member | Active | 2 machines      | Edit, Remove |

**Changes:**

- "Devices" → "Active Machines"
- Remove the "/ 2" per-member limit (machines are pooled at org level)
- Show actual count per member for visibility

---

## New: Organization-Wide Machine View

Add a collapsible section showing all active machines across the org:

```
┌─────────────────────────────────────────────────────────────┐
│ ▼ Active Machines (7)                                       │
├─────────────────────────────────────────────────────────────┤
│ Machine               │ Member        │ Last Active        │
├─────────────────────────────────────────────────────────────┤
│ simons-macbook        │ Simon Reiff   │ 2 minutes ago      │
│ simons-desktop        │ Simon Reiff   │ 5 minutes ago      │
│ alice-laptop          │ Alice Johnson │ 1 minute ago       │
│ alice-devcontainer-1  │ Alice Johnson │ 3 minutes ago      │
│ alice-devcontainer-2  │ Alice Johnson │ 8 minutes ago      │
│ bob-thinkpad          │ Bob Smith     │ Just now           │
│ bob-home-pc           │ Bob Smith     │ 12 minutes ago     │
└─────────────────────────────────────────────────────────────┘
```

**Purpose:**

- Visibility into what's consuming machine slots
- Helps admins understand usage patterns
- Surfaces potential issues (stale containers, forgotten VMs)

---

## Overage Display

When org exceeds included machines, show a friendly banner:

```
┌─────────────────────────────────────────────────────────────┐
│ ℹ️ You're using 11 machines (9 included with 3 seats).      │
│                                                             │
│ Mouse continues to work on all machines. To increase your   │
│ included capacity, add more seats or contact sales for      │
│ volume pricing.                                             │
│                                                             │
│ [Add Seats]  [Contact Sales]                                │
└─────────────────────────────────────────────────────────────┘
```

**Note:** This is informational, not blocking. Per the Agent-as-Salesperson model, we never hard-block paying customers.

---

## API Response Changes

### GET /api/portal/team (Updated Response)

```javascript
// Before (v4)
{
  "members": [...],
  "invites": [...],
  "usage": {
    "totalSeats": 5,
    "usedSeats": 3,
    "availableSeats": 2
  }
}

// After (v4.1)
{
  "members": [...],
  "invites": [...],
  "usage": {
    "totalSeats": 3,
    "machinesPerSeat": 3,
    "machinesIncluded": 9,        // seats × machinesPerSeat
    "machinesActive": 7,          // actual active count
    "machinesAvailable": 2,       // included - active (min 0)
    "isOverLimit": false
  },
  "machines": [                   // NEW: detailed machine list
    {
      "id": "mach_abc123",
      "name": "simons-macbook",
      "memberId": "auth0|user1",
      "memberName": "Simon Reiff",
      "lastSeen": "2026-01-26T14:30:00Z"
    },
    // ...
  ]
}
```

---

## DynamoDB Schema Updates

### Machine Entity (New)

```
PK: LICENSE#{licenseId}
SK: MACHINE#{machineFingerprint}
GSI1PK: ORG#{orgId}
GSI1SK: MACHINE#{machineFingerprint}

Attributes:
- machineId: string (fingerprint hash)
- machineName: string (hostname)
- memberId: string (user who activated)
- memberEmail: string
- lastSeen: ISO timestamp
- firstSeen: ISO timestamp
- metadata: { os, vsCodeVersion, etc. }
```

### Query Patterns

| Query                          | Access Pattern                                |
| ------------------------------ | --------------------------------------------- |
| Get all machines for a license | PK = LICENSE#{id}, SK begins_with MACHINE#    |
| Get all machines for an org    | GSI1PK = ORG#{orgId}, SK begins_with MACHINE# |
| Get active machines            | Above + filter lastSeen > (now - 15min)       |

---

## Implementation Checklist

### Code Changes

| File                        | Change                                  | Priority |
| --------------------------- | --------------------------------------- | -------- |
| `constants.js`              | Rename team→business, sessions→machines | 🔴 High  |
| `dynamodb.js`               | Add machine entity functions            | 🔴 High  |
| `/api/portal/team/route.js` | Update response format                  | 🔴 High  |
| `TeamManagement.js`         | Update UI terminology                   | 🔴 High  |
| `team.test.js`              | Update test expectations                | 🔴 High  |

### New Functions Needed (dynamodb.js)

```javascript
// Machine operations
registerMachine(licenseId, orgId, machineFingerprint, metadata);
updateMachineHeartbeat(licenseId, machineFingerprint);
getActiveMachines(licenseId, (windowMinutes = 15));
getOrgActiveMachines(orgId, (windowMinutes = 15));
getMachinesByMember(orgId, memberId);
```

---

## Migration Notes

### Existing "Team" References

For launch, we can do a soft rename:

- Internal code: `team` → `business`
- UI: "Business" everywhere
- URLs: `/portal/team` can stay (redirect later if needed)
- Stripe: Create new `business` products, archive `team` products

### Existing Device Data

If any device data exists in DynamoDB, it maps cleanly to machine data:

- `DEVICE#` SK prefix → `MACHINE#` SK prefix
- Same fingerprinting concept
- Add `lastSeen` tracking for heartbeat model

---

## See Also

- [20260126_PRICING_v4.1_BUSINESS_TIER_AND_MACHINE_MODEL.md](./20260126_PRICING_v4.1_BUSINESS_TIER_AND_MACHINE_MODEL.md)
- [20260126_AGENT_SALESPERSON_ENFORCEMENT_MODEL.md](./20260126_AGENT_SALESPERSON_ENFORCEMENT_MODEL.md)
