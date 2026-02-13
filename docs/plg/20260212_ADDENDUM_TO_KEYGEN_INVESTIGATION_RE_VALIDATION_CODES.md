# Addendum: Keygen Validation Codes for Machine-Deleted Scenario

**Date:** 2026-02-12
**Author:** GC (Copilot)
**Parent Document:** `hic-ai-inc.github.io/docs/plg/20260211_REPORT_ON_KEYGEN_INVESTIGATION.md`
**Related:** Phase 3D (Startup Flow / Expiry Bug Fix)

---

## Purpose

The Feb 11 Keygen Investigation (Sections 5.3, 6.2, 9.6) established that DEACTIVATE_DEAD + NO_REVIVE causes machine deletion after heartbeat expiry, requiring automatic re-activation in the extension (planned for Phase 3). This addendum contributes two findings not covered in the parent document:

1. **The exact Keygen `meta.code` values** returned by `validate-key` when a machine has been deleted
2. **The extension-side data flow trace** showing where the validation code is lost, preventing the extension from distinguishing "machine deleted" from "license expired"

---

## 1. Keygen Validation Codes (From Official API Documentation)

Source: [Keygen API — Licenses — Validate by Key](https://keygen.sh/docs/api/licenses/#licenses-actions-validate-key)

Our `keygen.js` calls Keygen's `/licenses/actions/validate-key` with `scope: { fingerprint }`. This tells Keygen to validate the license AND verify that a machine with the given fingerprint exists. When the machine has been deleted by DEACTIVATE_DEAD, Keygen returns `meta.valid: false` with one of these codes:

| Code | Description (from Keygen docs) | When it fires in our system |
|---|---|---|
| `FINGERPRINT_SCOPE_MISMATCH` | "None or not enough of the validated license's machine relationships match the provided machine fingerprint scope." | **After DEACTIVATE_DEAD deletes the machine** — the primary case |
| `HEARTBEAT_DEAD` | "The validated machine or fingerprint scope belongs to a dead machine." | Brief window between death and deletion |
| `NO_MACHINES` | "Not activated. The validated license does not meet its floating policy's requirement of at least 1 associated machine." | If all machines on the license are deleted |
| `HEARTBEAT_NOT_STARTED` | "The validated machine or fingerprint scope requires a heartbeat but one is not started." | Possible immediately after re-activation, before first heartbeat ping |

**Critical detail:** In all four cases, `data.attributes.status` remains `"ACTIVE"` — the license itself is valid. Only the machine scope fails. This is the distinguishing signal for re-activation: `valid: false` + `code ∈ {above set}` + `license.status === "ACTIVE"`.

Keygen example response (from their docs):

```json
{
  "meta": {
    "valid": false,
    "detail": "fingerprint scope does not match",
    "code": "FINGERPRINT_SCOPE_MISMATCH"
  },
  "data": {
    "attributes": {
      "status": "ACTIVE"
    }
  }
}
```

---

## 2. Extension-Side Information Loss

The server (`validate/route.js`) passes the Keygen `code` through in its response. The information is lost at the extension layer:

```
keygen.js          →  returns { valid, code, detail, license }     ✓ code present
route.js           →  returns { valid, code, detail, license }     ✓ code present
httpClient.js      →  returns { valid, suspended }                 ✗ code DISCARDED
validate.js        →  sees valid=false, not suspended → EXPIRED    ✗ wrong conclusion
```

**The 3D fix:** `httpClient.validateLicense()` must return `code`, `detail`, and `licenseStatus` alongside the existing `valid` and `suspended` fields. Then `validate.js` can detect the machine-recovery codes and trigger re-activation instead of marking EXPIRED.

> **✅ IMPLEMENTED (2026-02-13):** This fix has been applied. `httpClient.validateLicense()` now returns `{ valid, suspended, code, detail, licenseStatus }`. `validate.js` uses `MACHINE_RECOVERY_CODES` Set to detect recoverable machine deletions and triggers re-activation instead of marking EXPIRED. See commit `307ee22a`.

---

## 3. Mapping Our Code Terms to Keygen Terms

The parent document and our codebase use the term "machine not found" generically. The VSIX heartbeat handler (`mouse-vscode/src/licensing/heartbeat.js`, line ~280) has `case "machine_not_found"` — this is our own string literal, not a Keygen code.

For implementation, the mapping is:

| Our term (informal) | Keygen `meta.code` (official) | Where it surfaces |
|---|---|---|
| "machine not found" | `FINGERPRINT_SCOPE_MISMATCH` or `NO_MACHINES` | validate-key response |
| "machine dead" | `HEARTBEAT_DEAD` | validate-key response |
| `"machine_not_found"` (code literal) | Mapped from heartbeat 404 response | heartbeat handler |

---

## 4. Confirmation of SWR's Question

SWR asked: *"Is there somehow a way for a user to enter a license key following Mouse: Enter License Key yet the device fingerprint is not passed to the /validate endpoint?"*

**No.** The fingerprint is always generated locally and always included. The issue is not a missing fingerprint — it is a fingerprint that correctly identifies a machine that no longer exists on Keygen's side (deleted by DEACTIVATE_DEAD after heartbeat expiry), exactly as the parent document's Section 5.3 describes.

---

*End of addendum.*
