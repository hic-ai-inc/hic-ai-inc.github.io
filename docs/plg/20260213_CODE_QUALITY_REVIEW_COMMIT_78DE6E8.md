# Code Quality Review: Commit 78de6e8

**Date:** 2026-02-13  
**Reviewer:** GC (GitHub Copilot)  
**Requested by:** SWR  
**Scope:** All three files changed in commit `78de6e8` ("fix: restore truncated catch block portal devices route")  
**Purpose:** Comprehensive code quality assessment — security vulnerabilities, coding defects, error handling failures, guard clause issues, maintainability, and readability.

---

## Files Reviewed

| File                                              | Lines | Role                                         |
| ------------------------------------------------- | ----- | -------------------------------------------- |
| `plg-website/src/app/api/portal/devices/route.js` | 125   | API route for GET /api/portal/devices        |
| `plg-website/src/app/portal/devices/page.js`      | 367   | React client component for /portal/devices   |
| `plg-website/src/lib/dynamodb.js`                 | 1883  | DynamoDB operations (changed functions only) |

---

## 1. route.js — Portal Devices API Route

### 1.1 Security

- **Information leakage (line 108):** The internal Keygen `licenseId` is returned in the JSON response to the client. The client component (`page.js`) never uses this field. Exposing internal identifiers without purpose violates least-exposure principles.

- **No rate limiting:** The endpoint has no protection against brute-force polling or enumeration. Any holder of a valid Cognito token can hit it at arbitrary frequency.

### 1.2 Coding Defects

- **Dead code (lines 27–51):** `MOCK_DEVICES` is a 26-line array defined at module scope and never referenced anywhere in the file. This is development scaffolding left in production code.

### 1.3 Error Handling / Guard Clauses

- **Three indistinguishable silent failures (lines 63, 68, 74):** Three different error conditions — no email in token, no customer record, and no license — all return the same `{ devices: [], maxDevices: 0 }` response with HTTP 200. The client has no way to distinguish "you genuinely have zero devices" from "your token is malformed" from "your customer record doesn't exist" from "you have no license." Each should produce a distinct response — at minimum different status codes or error fields.

- **Missing email returns 200 instead of 4xx (line 63):** A valid JWT with no `email` claim indicates a Cognito misconfiguration. This is an abnormal server-side condition, not a valid user state. It should return an error, not an empty success response.

- **Catch-all error handler (lines 117–121):** Every possible exception — auth failures, DynamoDB timeouts, SDK misconfigurations, network errors — collapses to the same generic `{ error: "Failed to fetch devices" }` with HTTP 500. No differentiation by error type, no structured logging of error class.

### 1.4 Maintainability / Readability

- **Magic number `3` (line 101):** The default `maxDevices` fallback is a raw integer literal. This same value is independently hardcoded in `page.js` line 25. Should be a named constant imported from a shared location (e.g., `constants.js`).

- **Fragile fallback chain (lines 99–101):** `planConfig?.maxConcurrentMachinesPerSeat || planConfig?.maxConcurrentMachines || 3` reveals that the `PRICING` config object has an inconsistent schema between plan types. The API route shouldn't need to guess which field name is correct — the pricing schema should use a unified field name.

- **Response mapping drops fields silently (lines 90–97):** The `devices.map()` strips `userId`, `userEmail`, and all custom metadata from each device record. This is arguably correct behavior (minimizing PII exposure) but there is no comment explaining the intentional omission, making it look like an oversight.

---

## 2. page.js — Devices Page Component

### 2.1 Coding Defects

- **React Hook exhaustive-deps violation (lines 32–35):** The `useEffect` callback references `fetchDevices` but does not include it in the dependency array. This is a standard React lint error that can cause stale closures. `fetchDevices` should be wrapped in `useCallback` or defined inside the effect body.

- **Active-by-default for unknown devices (line 291):** `isActiveDevice` returns `true` when both `lastSeen` and `createdAt` are missing (`!device.lastSeen && !device.createdAt`). A device with zero timing data should default to **inactive**, not active. Defaulting to active inflates the active count and misrepresents usage.

- **Unguarded `Date` parsing (line 292):** `new Date(device.lastSeen || device.createdAt)` — if the string is malformed or unexpected, this produces `Invalid Date`. The subsequent comparison `lastActivity > twoHoursAgo` returns `false`, so the device silently appears inactive. No crash occurs, but the behavior is undefined from the user's perspective. The same issue exists in `formatRelativeTime` (line 340) where `diffMs` would be `NaN`, producing garbled text in the UI.

### 2.2 Error Handling

- **No distinction between null session and missing token (lines 48–52):** `!session?.idToken` covers both "getSession returned null" (no auth at all) and "session exists but idToken is absent" (token refresh failure). These are different failure modes requiring different user-facing guidance but are collapsed into a single error string.

### 2.3 Maintainability / Readability

- **Hardcoded 2-hour window (line 292):** `2 * 60 * 60 * 1000` is independently hardcoded here, and also in `getActiveDevicesInWindow`'s default parameter (`windowHours = 2`) in dynamodb.js, and in `getActiveUserDevicesInWindow`. This value has already changed once (from 7 days to 2 hours). When it changes again, all three locations must be updated in lockstep. Should be a single shared constant.

- **367-line monolith:** The file contains data fetching logic, business logic (`isActiveDevice`), presentation markup, utility functions (`formatRelativeTime`, `getPlatformName`), and four embedded SVG icon definitions. These responsibilities should be separated: extract `DeviceIcon`, `getPlatformName`, `formatRelativeTime`, and `isActiveDevice` into their own modules.

- **~100 lines of inline SVG (lines 298–336):** Four platform icon variants are embedded directly in the component JSX. These should be separate icon components or imported assets.

- **Magic number `3` (line 25):** Same default as route.js line 101, same problem — no named constant.

- **Fragile null-vs-zero semantics (line 162):** `totalActiveDevices !== null` gates whether the team usage line renders. The distinction between `undefined`, `null`, and `0` is subtle and easy to break if the API response shape changes.

---

## 3. dynamodb.js — Changed Functions

Functions reviewed: `getLicenseDevices`, `addDeviceActivation`, `getActiveDevicesInWindow`, `getUserDevices`, `getActiveUserDevicesInWindow`, `removeDeviceActivation`, `updateDeviceLastSeen`, `generateInviteToken`, `createOrgInvite`.

### 3.1 Security Vulnerabilities

- **`...metadata` spread can overwrite critical fields — `addDeviceActivation` (line 669):** The object spread `...metadata` is positioned in the middle of the item construction — after `PK`, `SK`, `fingerprint`, etc. but before `userId`, `userEmail`, `createdAt`. A caller passing `metadata: { PK: 'LICENSE#attacker-license', fingerprint: 'spoofed' }` would overwrite the partition key and fingerprint. This is a **data corruption / privilege escalation** vulnerability. The `metadata` parameter must be namespaced as a nested object (e.g., `metadata: { ...metadata }`) or validated against a field allowlist.

- **Same issue, worse, in `createOrgInvite` (line 1499):** `...metadata` is spread **last** in the item construction, meaning it can overwrite **every** preceding field including `PK`, `SK`, `GSI1PK`, `token`, `status`, `role`, `invitedBy`, and `expiresAt`. Since invite tokens control organization access, this is a critical vulnerability.

- **Insecure token generation — `generateInviteToken` (line 1454):** Uses `Math.random()` to generate 32-character invite tokens. `Math.random()` is not cryptographically secure — its output is predictable given enough samples (CWE-338: Use of Cryptographically Weak PRNG). Invite tokens grant organization membership and must use `crypto.randomBytes()` or `crypto.getRandomValues()`.

- **Device reassignment via heartbeat — `updateDeviceLastSeen` (line 809):** The optional `userId` parameter, when provided, rebinds a device record to a new user via `SET userId = :userId`. Any authenticated user who knows a valid `keygenMachineId` could call the heartbeat endpoint and claim another user's device record. The function should not allow reassigning `userId` at all, or should validate that the caller is the existing owner of the device.

### 3.2 Coding Defects

- **Duplicate comment (lines 674–675):** The line `// Increment activated devices count only for new devices` appears twice in immediate succession.

- **Race condition in fingerprint deduplication — `addDeviceActivation` (lines 616–618):** The function reads all devices via `getLicenseDevices()`, searches for a matching fingerprint in memory, then writes either an update or a new record. Two concurrent activations with the same fingerprint can both pass the `existingDevices.find()` check and both create new device records — resulting in duplicates. This should use a DynamoDB conditional write (`ConditionExpression: 'attribute_not_exists(SK)'`) or a DynamoDB transaction.

- **Non-atomic counter operations — `addDeviceActivation` (line 676) and `removeDeviceActivation` (line 778):**
  - In `addDeviceActivation`: The device record is created with `PutCommand`, then `activatedDevices` is incremented in a separate `UpdateCommand`. If the increment fails (network error, throttle), the counter drifts permanently below the real count.
  - In `removeDeviceActivation`: The device is deleted, then the counter is decremented separately. If the decrement fails, same drift. Worse: if `removeDeviceActivation` is called twice for the same machine ID, the `DeleteCommand` is idempotent (deletes nothing the second time) but the decrement runs unconditionally both times, driving the counter negative. There is no `ConditionExpression` preventing this.

- **Scan-then-filter inefficiency — `getUserDevices` (line 722):** Calls `getLicenseDevices()` (which returns ALL device records for the license) then filters in JavaScript by `device.userId === userId`. This is O(n) on total device count. For licenses with many historical devices, a `FilterExpression` on the DynamoDB query or a GSI on `userId` would be more efficient.

### 3.3 Error Handling / Guard Clauses

- **No try/catch on five functions:** `getLicenseDevices` (line 568), `getUserDevices` (line 719), `getActiveDevicesInWindow` (line 696), `getActiveUserDevicesInWindow` (line 744), and `removeDeviceActivation` (line 768) all let raw AWS SDK errors propagate uncaught. Compare with `createOrgInvite` and `getTrialByFingerprint`, which have structured logging via `createLogger()` and proper try/catch blocks. The inconsistency means some failures are logged and some are invisible.

- **Partial parameter validation in `addDeviceActivation` (line 605):** Validates `userId` and `userEmail` (the new Phase 3E requirement) but does NOT validate `keygenLicenseId`, `keygenMachineId`, or `fingerprint`. Passing `undefined` for any of these creates a corrupt DynamoDB record with keys like `LICENSE#undefined` or `DEVICE#undefined`.

- **No validation in `getLicenseDevices` (line 568):** If called with `undefined` or `null`, it queries `PK = LICENSE#undefined`, which silently returns an empty result set. This hides programming errors upstream instead of surfacing them.

- **No validation in `removeDeviceActivation` (line 768):** Neither `keygenLicenseId` nor `keygenMachineId` is validated. Calling with `undefined` silently attempts to delete a non-existent record and then unconditionally decrements the counter, corrupting the `activatedDevices` count.

- **`updateDeviceLastSeen` swallows errors silently (line 824):** The `ConditionalCheckFailedException` catch correctly prevents ghost record creation, but there is no logging at all — not even a debug-level message. Successfully prevented ghost records are invisible, making it harder to diagnose related issues.

### 3.4 Maintainability

- **Inconsistent `...metadata` positioning:** In `addDeviceActivation`, the spread is mid-object (some fields come after it). In `createOrgInvite`, the spread is last (it can overwrite everything). The pattern is unsafe in both cases but unsafe in different ways, which creates confusion about what fields are protected.

- **Inconsistent error handling patterns:** Some functions (`createOrgInvite`, `getTrialByFingerprint`) have try/catch with `createLogger()`. Others (`getLicenseDevices`, `getUserDevices`, `getActiveDevicesInWindow`, `getActiveUserDevicesInWindow`, `removeDeviceActivation`) have none. There is no apparent rationale for which functions receive error handling.

- **2-hour window default hardcoded in function signatures:** `windowHours = 2` appears in both `getActiveDevicesInWindow` and `getActiveUserDevicesInWindow` default parameters. Combined with the client-side hardcoding in `page.js`, this enforcement-critical value now lives in three independent locations.

---

## Severity Summary

| Severity     | Issue                                                    | Location                       |
| ------------ | -------------------------------------------------------- | ------------------------------ |
| **Critical** | `...metadata` spread can overwrite PK/SK/token/role      | dynamodb.js lines 669, 1499    |
| **Critical** | `Math.random()` for invite tokens (CWE-338)              | dynamodb.js line 1454          |
| **High**     | Race condition in fingerprint deduplication              | dynamodb.js line 616           |
| **High**     | Counter can go negative on double-remove                 | dynamodb.js line 778           |
| **High**     | Device reassignment via optional userId in heartbeat     | dynamodb.js line 809           |
| **Medium**   | Three silent 200 failures indistinguishable from success | route.js lines 63/68/74        |
| **Medium**   | Five functions with no error handling or logging         | dynamodb.js                    |
| **Medium**   | Partial param validation (PK/SK fields unvalidated)      | dynamodb.js line 605           |
| **Medium**   | Non-atomic counter writes (create + increment separate)  | dynamodb.js lines 676, 778     |
| **Low**      | 26 lines of dead MOCK_DEVICES code                       | route.js lines 27–51           |
| **Low**      | 2-hour window hardcoded in 3 independent locations       | route.js, page.js, dynamodb.js |
| **Low**      | React exhaustive-deps violation                          | page.js line 32                |
| **Low**      | Active-by-default for devices with no timing data        | page.js line 291               |
| **Low**      | Duplicate comment                                        | dynamodb.js lines 674–675      |
| **Low**      | Inline SVGs / monolithic component (~367 lines)          | page.js                        |

---

_End of automated review._

---

## 4. Post-Review Finding: Root Cause of Devices Page Displaying 0 Devices for Team Members

**Identified by:** SWR  
**Confirmed by:** GC + DynamoDB inspection  
**Severity:** **Critical** — Entire Devices page non-functional for all non-Owner team members

### Symptom

When authenticated as a Business team member (e.g., `simon.reiff@gmail.com`), the Devices page displays `0 of 5` active devices even after successful device activation and DynamoDB confirmation that the device record is properly paired to the user's Cognito `sub` under the correct license.

The Owner account (`sreiff@hic-ai.com`) displays devices correctly.

### Root Cause

The `/api/portal/devices` route (`route.js`) uses a **single-step license lookup** — it calls `getCustomerByEmail(userEmail)` and then reads `customer.keygenLicenseId` directly from the customer record. For team members who joined via invite, the customer record contains no `keygenLicenseId`, no `accountType`, no `orgId`, and no `orgRole`. These fields are only present on the Owner's record.

The `/api/portal/license` route (`route.js`) already solves this problem correctly with a **two-step fallback**:

1. Check `customer.keygenLicenseId` (direct license — works for Owners)
2. If absent, call `getUserOrgMembership(userId)` → `getOrganization(membership.orgId)` → `getCustomerByEmail(org.ownerEmail)` to resolve the license via the org relationship

The devices route was never given this same fallback logic. When `customer.keygenLicenseId` is `undefined`, the route hits the guard clause at line 74 and returns `{ devices: [], maxDevices: 0 }` — indistinguishable from a user with no license at all.

### DynamoDB Evidence

**`simon.reiff@gmail.com`** customer record (`USER#google_114165355764132910587`):
- `keygenLicenseId`: **absent**
- `keygenLicenseKey`: **absent**
- `accountType`: **absent**
- `orgId`: **absent**
- `orgRole`: **absent**
- `stripeCustomerId`: **absent**

**`sreiff@hic-ai.com`** customer record (`USER#9448c4a8-e081-70fb-4a30-a4ce0f67b8d0`):
- `keygenLicenseId`: `fab54aac-ea94-4d55-a2be-3e7c1ffe2cbd`
- `accountType`: `business`
- `orgId`: `cus_TuLKmYGoqenkv9`
- `orgRole`: `owner`
- All fields populated

### Required Fix

Import `getUserOrgMembership` and `getOrganization` into the devices route and replicate the same org-membership fallback pattern used by the license route. When a customer has no direct `keygenLicenseId`, resolve it through the org → owner → license chain. Use the resolved `accountType` for plan config lookup as well.

### Impact

Every non-Owner team member on every Business license sees 0 devices regardless of actual activations. This affects the core value proposition of the Business tier's team management portal.

### Note on Initial GC Misdiagnosis

GC's initial root cause hypothesis was that device records lacked `userId` fields and therefore failed the `getUserDevices` filter. SWR correctly predicted this was wrong — a fresh E2E activation with proper `userId` binding still produced the 0-device result. The actual failure occurs **upstream** of `getUserDevices`: the license ID is never resolved in the first place, so `getUserDevices` is never called. The DynamoDB query confirmed the hypothesis was wrong and the missing org-membership fallback was the true root cause.

---

_End of review._
