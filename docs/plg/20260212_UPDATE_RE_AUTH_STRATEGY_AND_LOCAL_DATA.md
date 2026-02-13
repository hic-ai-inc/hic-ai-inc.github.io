# Update: AuthStrategy Pattern & Local Data Minimization

**Date:** 2026-02-12
**Author:** GC (Copilot), with SWR direction
**Status:** APPROVED — SWR approved both decisions during implementation planning session
**Implementation:** ✅ Both decisions implemented (2026-02-13). AuthStrategy injection pattern in `activate.js`; local data minimization (extension stores device identifiers only, no identity fields). Commits `307ee22a`, `85e12e25`.
**Context:** Two architectural refinements to Phase 3A of the Multi-Seat Implementation Plan V3, arising from detailed review of the `openExternal` modularity concern and the question of what identity data (if any) the extension should persist locally.
**Parent Document:** [20260212_MULTI_SEAT_IMPLEMENTATION_PLAN_V3.md](20260212_MULTI_SEAT_IMPLEMENTATION_PLAN_V3.md)
**Related Documents:**

- [20260212_GC_PROPOSAL_BROWSER_DELEGATED_ACTIVATION.md](20260212_GC_PROPOSAL_BROWSER_DELEGATED_ACTIVATION.md) — Browser-delegated activation model (approved)
- [20260212_PROPOSED_SUBPHASE_PLAN_FOR_MULTI_USER_PHASE_3_V2.md](20260212_PROPOSED_SUBPHASE_PLAN_FOR_MULTI_USER_PHASE_3_V2.md) — Subphase plan (3A references updated by this document)

---

## Decision 1: Do NOT Persist userId/userEmail to license.json

### Background

The Phase 3A subphase plan (V2) and the Browser-Delegated Activation Proposal both specified that the extension should write `userId` and `userEmail` to `license.json` after a successful browser-delegated activation. The poll response from `/api/license/validate` would include these fields, and the extension would store them alongside `machineId`, `licenseKey`, `fingerprint`, and `status`.

This specification was carried forward from the original (superseded) AuthenticationProvider approach, where the extension acted as an OAuth client — holding tokens, managing sessions, and needing to know who the user was. When the browser-delegated proposal eliminated local token storage, the `userId`/`userEmail` fields survived as vestigial artifacts, as though the extension still needed to "know" the user's identity. It does not.

### Rationale

The entire purpose of the multi-seat implementation is to bind users to devices **in DynamoDB**. Once that binding exists (written during browser-assisted activation), the backend can resolve user identity from any device identifier. The extension proves device identity; the backend resolves user identity. There is no scenario where the extension needs to know, display, or transmit who the user is.

The data flow for every operation:

| Operation          | Extension Sends                          | Backend Resolves (from DDB)             | Extension Needs Back           |
| ------------------ | ---------------------------------------- | --------------------------------------- | ------------------------------ |
| Activation poll    | `licenseKey`, `fingerprint`              | `userId` (wrote it during browser auth) | `machineId`, `status`          |
| Heartbeat          | `fingerprint`, `machineId`, `licenseKey` | `userId` (from device record lookup)    | `status`, `concurrentMachines` |
| Re-activation (3D) | `licenseKey`, `fingerprint`              | `userId` (from existing device record)  | new `machineId`, `status`      |

In all three cases, the extension sends **device identifiers only**. The backend resolves **user identity** from the DynamoDB device record — a record that the backend itself wrote during the original browser-based activation. The extension never needs to echo identity data back to the server (the server already has it), nor does it need to display it to the user (the admin portal does that via authenticated browser sessions — a completely separate channel).

### Consequences

**Files eliminated from 3A's change set:**

- **`licensing/state.js`** — No schema change needed. No `userId` or `userEmail` fields added. Zero modifications to this file in 3A. This reduces the risk surface and simplifies testing.

**Changes to poll response handling:**

- **`licensing/commands/activate.js`** — The poll result handler extracts only `{ machineId, status }`. It does not look for, store, or depend on identity fields. If the backend includes `userId`/`userEmail` in the validate response (as implemented in 3B), the extension simply ignores them. No coupling.

**Changes to heartbeat payload:**

- None. The heartbeat payload remains `{ fingerprint, machineId, sessionId, licenseKey }`. The backend already does a DDB lookup on every heartbeat and obtains `userId` from the device record there. No identity data is sent from the extension.

**Security benefit:**

- `license.json` is stored on disk at `~/.hic/license.json`. By not writing `userId` or `userEmail` to this file, we avoid exposing user identity data to any process with read access to the user's home directory. This is consistent with the browser-delegated model's zero-local-credential principle: the extension holds no identity information whatsoever.

**What the validate response still includes:**

- The `/api/license/validate` endpoint (modified in 3B) does return `userId` and `userEmail` when a device record exists. This is harmless and may be useful for future consumers (e.g., a portal integration that confirms "this device is registered to user X"). The extension's polling handler is simply not required to consume or persist these fields.

### Documents Affected

The following documents reference `userId`/`userEmail` storage in `license.json` or `state.js`. These references should be treated as superseded by this decision when implementing 3A:

- **Subphase Plan V2** (3A section): References `state.js — add userId, userEmail fields to the schema` → **Eliminated.**
- **Browser-Delegated Activation Proposal** (Section 3.3, table): References `licensing/state.js — Add userId, userEmail fields` → **Eliminated.**
- **Implementation Plan V3** (Phase 3 subphase summary for 3A): References `userId, userEmail` in several places → **Extension-side persistence eliminated; backend-side storage via DDB is unchanged and correct.**

---

## Decision 2: AuthStrategy Injection Pattern for activate.js

### Background

Phase 3A requires the activation command to open a browser so the user can authenticate via the website's existing Cognito session. The natural API for this in VS Code is `vscode.env.openExternal(Uri.parse(url))`. However, the activation command lives in `licensing/commands/activate.js` — the shared core module that is consumed by both the VS Code extension (`mouse-vscode/`) and historically by the CLI distribution (`packaging/`). This module has **zero** dependencies on `vscode` or any other runtime-specific API, by deliberate design.

If we import `vscode` in `activate.js`, or even call `vscode.env.openExternal()` directly, we break the shared-core contract. Every non-VS-Code consumer — any future Cursor/Kiro/Claude Code integration, any terminal-based flow, any headless CI/CD scenario — would need to provide or mock the `vscode` module.

### The Current Architecture

The call chain today:

```
mouse-vscode/src/extension.js              ← VS Code API layer (imports vscode)
  └─ licenseChecker.activateLicense(key)
       └─ licensing/commands/activate.js    ← SHARED CORE (no vscode dependency)
            ├─ httpClient.activateLicense(key, fingerprint, ...)
            └─ stateManager.activateLicense(key, machineId, ...)
```

The boundary that must be preserved:

| Layer                      | May import `vscode`? | May import platform-specific APIs? |
| -------------------------- | -------------------- | ---------------------------------- |
| `mouse-vscode/src/`        | Yes                  | Yes                                |
| `licensing/` (shared core) | **No — must never**  | **No**                             |

The `activate()` function already accepts an `options` object using dependency injection: `{ stateDir, httpClient }`. The `httpClient` injection point exists specifically for testability — tests pass a mock HTTP client. The same pattern extends naturally to authentication.

### Design: AuthStrategy as an Options Property

```javascript
/**
 * @typedef {Object} AuthStrategy
 * @property {(url: string) => Promise<void>} openAuthUrl
 *   Open the authentication URL for the user.
 *   VS Code: vscode.env.openExternal(). CLI: platform browser open. Headless: no-op.
 * @property {(message: string) => void} [showProgress]
 *   Optional: show progress to user during polling.
 *   VS Code: status bar update. CLI: spinner or console.log. Headless: no-op.
 * @property {(message: string) => void} [showMessage]
 *   Optional: show informational message.
 *   VS Code: vscode.window.showInformationMessage(). CLI: console. Headless: no-op.
 */
```

`activate()` gains one new optional property in its existing `options` parameter:

```javascript
export async function activate(licenseKey, options = {}) {
  // ... existing validation, stateManager, httpClient setup ...

  const authStrategy = options.authStrategy;

  if (authStrategy) {
    // Browser-delegated activation flow (Phase 3A)
    const activateUrl = buildActivateUrl(licenseKey, state);
    await authStrategy.openAuthUrl(activateUrl);
    authStrategy.showProgress?.("Waiting for browser authentication...");
    const pollResult = await httpClient.pollActivationStatus(
      licenseKey, state.fingerprint
    );
    if (pollResult.success) {
      stateManager.activateLicense(licenseKey, pollResult.machineId, {
        machineId: pollResult.machineId,
      });
      return { success: true, machineId: pollResult.machineId, ... };
    }
    // ... handle timeout/error ...
  } else {
    // Legacy direct activation (current behavior, preserved for backward compat)
    const result = await httpClient.activateLicense(licenseKey, ...);
    // ... existing flow, unchanged ...
  }
}
```

Each consumer then provides its own implementation:

**VS Code** (in `license-checker.js`):

```javascript
const result = await activate(licenseKey, {
  authStrategy: {
    openAuthUrl: (url) => vscode.env.openExternal(vscode.Uri.parse(url)),
    showProgress: (msg) => statusBarManager?.setStatus("activating", msg),
    showMessage: (msg) => vscode.window.showInformationMessage(msg),
  },
});
```

**CLI** (future):

```javascript
const result = await activate(licenseKey, {
  authStrategy: {
    openAuthUrl: (url) => import("open").then((m) => m.default(url)),
    showProgress: (msg) => process.stdout.write(`\r⏳ ${msg}`),
    showMessage: (msg) => console.log(msg),
  },
});
```

**Headless / GitHub Actions** (future):

```javascript
const result = await activate(licenseKey, {
  authStrategy: {
    openAuthUrl: async () => {
      /* no-op — pre-authed via API key */
    },
  },
  httpClient: new HttpClient({ apiKey: process.env.MOUSE_API_KEY }),
});
```

**Unit tests:**

```javascript
const result = await activate(licenseKey, {
  authStrategy: {
    openAuthUrl: async () => {}, // no-op stub
    showProgress: () => {},
  },
  httpClient: mockHttpClient,
});
```

### Rationale

1. **Preserves the shared-core invariant.** `licensing/commands/activate.js` gains zero new imports. No `vscode`, no `child_process`, no platform-specific modules. The only new code is a branch on `options.authStrategy` and a JSDoc typedef — pure documentation.

2. **Consistent with existing DI pattern.** The `options.httpClient` injection already establishes the pattern of "core defines the interface, consumer provides the implementation." `options.authStrategy` is the same pattern, same shape, same test story.

3. **Multi-platform flexibility.** The same `activate()` function serves VS Code (Mouse), Cursor, Kiro, Claude Code CLI, Aider, `npx`, and GitHub Actions without any code change to the core. Each platform provides a one-liner implementation of `openAuthUrl`. This future-proofs the activation flow against platform proliferation.

4. **Testability.** Tests pass `authStrategy: { openAuthUrl: async () => {} }` — zero mocks of `vscode`, zero mocks of `child_process.exec('open ...')`. The core orchestration logic is tested in complete isolation. The strategy implementation is tested separately in its own context (VS Code integration tests, CLI integration tests, etc.).

5. **Why a strategy object, not a bare callback.** The activation flow has multiple consumer-specific touchpoints: opening the browser, showing polling progress, displaying the final success/error message. A strategy object groups them coherently. Future auth mechanisms (device-code flow, API-key flow) may differ fundamentally in how they present the auth step — the strategy pattern accommodates this without touching `activate.js` again.

### Consequences

**Files touched in 3A (revised):**

| File                                            | Change                                                                                 | Compared to Original 3A Plan       |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------- |
| `licensing/commands/activate.js`                | Accept `options.authStrategy`; branch on presence; add `buildActivateUrl()`            | Same work, formalized with typedef |
| `licensing/http-client.js`                      | Add `pollActivationStatus(licenseKey, fingerprint)`                                    | Unchanged                          |
| `licensing/constants.js`                        | Add `ACTIVATE_URL`, `POLL_INTERVAL_MS`, `POLL_TIMEOUT_MS`                              | Unchanged                          |
| ~~`licensing/state.js`~~                        | ~~Add userId, userEmail~~                                                              | **Eliminated** (Decision 1)        |
| `mouse-vscode/src/licensing/license-checker.js` | Construct VS Code `authStrategy` in `activateLicense()`, pass to core                  | New: builds strategy object        |
| `mouse-vscode/src/extension.js`                 | Minimal — `mouse.enterLicenseKey` handler unchanged (license-checker handles strategy) | Possibly no change                 |

**What does NOT change:**

- `licensing/` directory gains zero new dependencies.
- The `AuthStrategy` typedef is documentation only (JSDoc). JavaScript does not enforce it at runtime. It is a duck-typed contract.
- The existing direct-activation flow (no browser, no auth) remains functional when `authStrategy` is not provided. Current VSIX and npx builds continue working without any change until 3E flips the switch.
- Trial flow is completely untouched.
- `licensing/commands/index.js` — no change (still re-exports `activate`).
- `licensing/index.js` — no change (still re-exports everything).
- `packaging/` — no change needed. The legacy path is preserved. When npx is deprecated, this becomes irrelevant.

**Interaction with 3E (Require Auth):**

When the backend starts rejecting unauthenticated activations (HTTP 401), any consumer calling `activate()` without `authStrategy` will receive a 401 error from the legacy `httpClient.activateLicense()` call. This is the correct forcing function: it ensures every active consumer has been updated with a working auth strategy before 3E goes live. Since we control the only active consumer (VSIX) and npx can be disabled with a flag, this is safe.

**Interaction with 3D (Startup/Expiry Fix):**

Unaffected. Re-activation is auth-free — the backend looks up the existing DDB binding by fingerprint and mints a new Keygen machine without requiring fresh authentication. No `authStrategy` is involved in the 3D flow; the extension calls the activation API directly using the existing code path, and the backend trusts the DDB record as proof of prior user-device association.

---

## Summary of Changes to Implementation Plan

| Item                         | Original 3A Spec                                            | Revised per This Document                                                    |
| ---------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `licensing/state.js` changes | Add `userId`, `userEmail` fields                            | **None** — eliminated                                                        |
| Poll response consumption    | Extract `userId`, `userEmail`, `machineId`, `status`        | Extract `machineId`, `status` only                                           |
| Browser-open mechanism       | Unspecified (implied direct `vscode.env.openExternal` call) | Via `AuthStrategy` injection in `options`                                    |
| `license.json` schema        | Gains `userId`, `userEmail`                                 | **No change** to schema                                                      |
| Heartbeat payload            | Subphase plan discussed adding `userId`                     | **No change** — backend resolves from DDB                                    |
| New file count in 3A         | 0 (modifications only)                                      | 0 (unchanged)                                                                |
| Total LOC change estimate    | ~120 LOC                                                    | ~120 LOC (same magnitude; `state.js` eliminated, AuthStrategy typedef added) |

---

_End of update memo._
