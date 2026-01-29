# Device Validation User Journey

**Date:** 2026-01-29  
**Author:** GitHub Copilot (Claude Opus 4.5) with SWR  
**Status:** Design Specification  
**Related:** PLG_ROADMAP_v4.md, 20260129_E2E_BACKEND_VALIDATION_SPEC.md

---

## 1. Overview

This document specifies the complete device validation flow for the Mouse VS Code extension, covering trial initialization, license validation, and device-user linking. The core principle is that **device history is immutable based on fingerprint** — the backend always knows the truth about a device regardless of what the client sends.

---

## 2. Identity Hierarchy

| Signal          | Reliability | Purpose                                                                  |
| --------------- | ----------- | ------------------------------------------------------------------------ |
| **Fingerprint** | High        | Primary device identity (hardware-derived, persistent across reinstalls) |
| **MachineId**   | Medium      | Secondary identifier (may change with OS reinstalls)                     |
| **IP Address**  | Low         | Analytics/fraud detection only — **never used for identity**             |

### Why IP Address Cannot Be Used for Identity

- Shared office networks (thousands of users behind one IP)
- VPNs (entire companies behind one exit node)
- Coffee shops, coworking spaces, universities
- CGNAT (mobile carriers share IPs across thousands)
- Dynamic residential IPs (change daily/weekly)

---

## 3. Device Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         DEVICE LIFECYCLE                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. INSTALL (VS Code Extension)                                          │
│     └─> Extension generates fingerprint + machineId                      │
│     └─> POST /api/license/validate { fingerprint, machineId }            │
│     └─> Backend creates anonymous device record → returns trial status   │
│     └─> Extension shows: "14 days remaining"                             │
│                                                                          │
│  2. TRIAL USAGE (Heartbeat Loop)                                         │
│     └─> POST /api/license/heartbeat { fingerprint }                      │
│     └─> Backend updates last-seen → returns days remaining               │
│     └─> Extension continues countdown                                    │
│                                                                          │
│  3. PURCHASE (Website)                                                   │
│     └─> User visits website from same machine                            │
│     └─> Backend detects: "This fingerprint exists in our records!"       │
│     └─> User creates account → device auto-linked to user                │
│     └─> Stripe checkout → license created → bound to user + device       │
│                                                                          │
│  4. POST-PURCHASE (Extension)                                            │
│     └─> POST /api/license/validate { fingerprint, licenseKey }           │
│     └─> Backend: "Device linked to valid license"                        │
│     └─> Extension: "Licensed ✓"                                          │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Validation Endpoint Specification

### `POST /api/license/validate`

**Request Body:**

```json
{
  "fingerprint": "required - hardware-derived device ID",
  "machineId": "optional - secondary identifier",
  "licenseKey": "optional - MOUSE-XXXX-XXXX-XXXX-XXXX format",
  "platform": "optional - darwin | win32 | linux",
  "appVersion": "optional - e.g., 0.9.9"
}
```

### Decision Tree

```
/api/license/validate { fingerprint, machineId, [licenseKey] }

1. Fingerprint provided?
   NO  → Return 400 "fingerprint required"
   YES → Continue to step 2

2. Look up device by fingerprint

   ┌─────────────────────────────────────────────────────────────────┐
   │ DEVICE EXISTS IN DATABASE                                       │
   ├─────────────────────────────────────────────────────────────────┤
   │                                                                  │
   │  Device linked to license?                                       │
   │  ├─ YES → Return license status:                                 │
   │  │        • ACTIVE    → { valid: true, status: "active", ... }   │
   │  │        • EXPIRED   → { valid: false, status: "expired", ... } │
   │  │        • SUSPENDED → { valid: false, status: "suspended" }    │
   │  │        • REVOKED   → { valid: false, status: "revoked" }      │
   │  │                                                               │
   │  │        NOTE: Ignore licenseKey in request — we KNOW this      │
   │  │        device. Client cannot override server-side truth.      │
   │  │                                                               │
   │  └─ NO (trial device) → Return trial status:                     │
   │           • TRIAL_ACTIVE  → { trial: true, daysRemaining: N }    │
   │           • TRIAL_EXPIRED → { trial: true, daysRemaining: 0 }    │
   │                                                                  │
   └─────────────────────────────────────────────────────────────────┘

   ┌─────────────────────────────────────────────────────────────────┐
   │ DEVICE UNKNOWN (new fingerprint)                                │
   ├─────────────────────────────────────────────────────────────────┤
   │                                                                  │
   │  licenseKey provided?                                            │
   │  ├─ YES → Validate license key                                   │
   │  │        • Valid   → Create device, bind to license, return     │
   │  │                    { valid: true, status: "active", ... }     │
   │  │        • Invalid → Return 400 "invalid license key"           │
   │  │        • Expired → Return { valid: false, status: "expired" } │
   │  │                                                               │
   │  └─ NO  → Create new trial device                                │
   │           Return { trial: true, daysRemaining: 14, ... }         │
   │                                                                  │
   └─────────────────────────────────────────────────────────────────┘
```

---

## 5. Scenario Matrix

### 5.1 New User Scenarios

| #   | Scenario                           | Request                                         | Response                             |
| --- | ---------------------------------- | ----------------------------------------------- | ------------------------------------ |
| N1  | First install, no license          | `{ fingerprint: "new" }`                        | `{ trial: true, daysRemaining: 14 }` |
| N2  | First install with license         | `{ fingerprint: "new", licenseKey: "valid" }`   | `{ valid: true, status: "active" }`  |
| N3  | First install with invalid license | `{ fingerprint: "new", licenseKey: "invalid" }` | `400: Invalid license key`           |

### 5.2 Returning Trial User Scenarios

| #   | Scenario                    | Request                                               | Response                                             |
| --- | --------------------------- | ----------------------------------------------------- | ---------------------------------------------------- |
| T1  | Mid-trial, day 7            | `{ fingerprint: "known-trial" }`                      | `{ trial: true, daysRemaining: 7 }`                  |
| T2  | Trial expired               | `{ fingerprint: "expired-trial" }`                    | `{ trial: true, daysRemaining: 0, expired: true }`   |
| T3  | Trial user provides license | `{ fingerprint: "known-trial", licenseKey: "valid" }` | `{ valid: true, status: "active" }` (upgrade device) |
| T4  | Trial reinstall attempt     | Same fingerprint after uninstall/reinstall            | Trial continues from where it was — **no reset**     |

### 5.3 Licensed User Scenarios

| #   | Scenario                           | Request                                        | Response                                                   |
| --- | ---------------------------------- | ---------------------------------------------- | ---------------------------------------------------------- |
| L1  | Active license                     | `{ fingerprint: "licensed" }`                  | `{ valid: true, status: "active" }`                        |
| L2  | Expired license                    | `{ fingerprint: "licensed-expired" }`          | `{ valid: false, status: "expired" }`                      |
| L3  | Expired license, tries fresh start | `{ fingerprint: "licensed-expired" }` (no key) | `{ valid: false, status: "expired" }` — **no fresh trial** |
| L4  | Suspended license                  | `{ fingerprint: "licensed-suspended" }`        | `{ valid: false, status: "suspended" }`                    |
| L5  | Revoked license                    | `{ fingerprint: "licensed-revoked" }`          | `{ valid: false, status: "revoked" }`                      |

### 5.4 Edge Cases

| #   | Scenario                                    | Request                                                | Response                                            |
| --- | ------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------- |
| E1  | Missing fingerprint                         | `{ machineId: "only" }`                                | `400: fingerprint required`                         |
| E2  | Empty request                               | `{}`                                                   | `400: fingerprint required`                         |
| E3  | IP matches known user, new device           | New fingerprint from known IP                          | **New trial** — IP is not identity                  |
| E4  | Licensed device, different license key sent | `{ fingerprint: "licensed", licenseKey: "different" }` | Return status of **bound** license, ignore sent key |

---

## 6. Anti-Abuse Protections

### 6.1 Trial Reset Prevention

**Problem:** User could reinstall extension to get fresh trial.

**Solution:** Fingerprint is hardware-derived and persists across reinstalls. Same fingerprint = same device = same trial countdown.

### 6.2 License Key Injection Prevention

**Problem:** User with expired license tries sending a different valid key.

**Solution:** Once a device is bound to a license, the binding is authoritative. The `licenseKey` field in requests is only used for:

- New devices (initial binding)
- Trial devices upgrading to licensed

### 6.3 Device Spoofing Consideration

**Problem:** Sophisticated user generates fake fingerprint.

**Mitigation:**

- Fingerprint algorithm uses multiple hardware signals
- Pattern detection for suspicious fingerprint patterns
- Rate limiting on new device creation per IP
- Future: Require email verification for trial start

---

## 7. Database Schema Implications

### Device Record

```javascript
{
  PK: "DEVICE#<fingerprint>",
  SK: "METADATA",

  // Identity
  fingerprint: "abc123...",
  machineId: "optional-secondary-id",

  // Status
  status: "trial" | "licensed" | "expired" | "suspended" | "revoked",

  // Trial tracking (if status === "trial")
  trialStartDate: "2026-01-29T00:00:00Z",
  trialDaysTotal: 14,

  // License binding (if status !== "trial")
  licenseId: "lic_xxx",
  licenseKey: "MOUSE-XXXX-...",
  boundAt: "2026-01-29T00:00:00Z",

  // User linking (optional)
  userId: "user_xxx",  // Linked when user logs in from this device
  linkedAt: "2026-01-29T00:00:00Z",

  // Metadata
  platform: "darwin",
  appVersion: "0.9.9",
  lastSeen: "2026-01-29T12:00:00Z",
  createdAt: "2026-01-29T00:00:00Z"
}
```

---

## 8. Response Schema

### Trial Response

```json
{
  "trial": true,
  "daysRemaining": 14,
  "trialStartDate": "2026-01-29T00:00:00Z",
  "trialEndDate": "2026-02-12T00:00:00Z",
  "expired": false,
  "features": ["all"]
}
```

### Licensed Response (Active)

```json
{
  "valid": true,
  "status": "active",
  "license": {
    "key": "MOUSE-XXXX-XXXX-XXXX-XXXX",
    "type": "individual",
    "expiresAt": "2027-01-29T00:00:00Z"
  },
  "features": ["all"],
  "maxDevices": 3,
  "currentDevices": 1
}
```

### Licensed Response (Expired)

```json
{
  "valid": false,
  "status": "expired",
  "license": {
    "key": "MOUSE-XXXX-XXXX-XXXX-XXXX",
    "expiredAt": "2026-01-15T00:00:00Z"
  },
  "renewUrl": "https://hic-ai.com/renew?license=MOUSE-XXXX"
}
```

---

## 9. Implementation Checklist

- [ ] Update `/api/license/validate` to handle fingerprint-only requests
- [ ] Create trial device records on first contact
- [ ] Implement trial day calculation from `trialStartDate`
- [ ] Return existing device status (no trial reset on reinstall)
- [ ] Return license status for bound devices (ignore sent `licenseKey`)
- [ ] Add device-user linking when user authenticates from known device
- [ ] Implement `/api/license/status` endpoint
- [ ] Implement `/api/license/deactivate` endpoint
- [ ] Implement `/api/license/machines` endpoint

---

## 10. Test Coverage Required

The E2E tests in `__tests__/e2e/journeys/j1-trial-start.test.js` validate these scenarios. Key test cases:

1. **J1.1** - New device gets trial
2. **J1.2** - Trial state persistence across requests
3. **J1.3** - Trial day countdown accuracy
4. **J1.4** - Trial expiration handling
5. **J1.5** - Reinstall does not reset trial
6. **J1.6** - Multiple devices get independent trials

---

## Revision History

| Date       | Author        | Changes               |
| ---------- | ------------- | --------------------- |
| 2026-01-29 | SWR + Copilot | Initial specification |
