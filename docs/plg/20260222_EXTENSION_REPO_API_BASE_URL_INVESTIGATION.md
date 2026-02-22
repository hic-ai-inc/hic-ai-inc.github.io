# Extension Repo (`hic`) API_BASE_URL Investigation

**Date:** 2026-02-22
**Author:** Kiro (source code investigation, verified against actual files in `~/source/repos/hic`)
**Owner:** SWR
**Status:** Investigation complete — pending SWR review and decisions
**Context:** Follow-up to the companion report `20260222_API_BASE_URL_AND_PROD_NAMING_INVESTIGATION.md` (completed in the Website repo). That report identified four open questions (H-1 through H-4) that could only be answered by examining source code in this repository. This memo answers all four, provides a comprehensive inventory of every file that touches API base URLs, maps the runtime architecture, and presents options for remediation.

**Methodology:** Every finding below was verified by reading actual source code in the `hic` repo. Import chains were traced from entry points through to the modules that make HTTP calls. The compiled esbuild output (`mouse-vscode/out/extension.js`) was inspected to confirm which URLs are baked into the shipped VSIX. No finding relies on planning documents or prior AI-generated analysis.

---

## 1. Summary

There is no build-time mechanism to switch between staging and production API URLs. The entire VSIX extension's licensing API communication is controlled by a single hardcoded line in `licensing/constants.js`. Three additional files reference a non-existent host (`api.hic-ai.com`) that has never worked. All user-facing URLs (pricing, portal, activate pages) already point to production (`https://hic-ai.com`).

The scope of the problem is smaller than the planning documents suggested. One line controls all API routing. Three dead-code references need cleanup. No architectural changes are required.

---

## 2. Answers to the Four Open Questions

### H-1: Does a release/build script exist that modifies `API_BASE_URL`?

**No.**

`scripts/release-mouse.sh` exists and is a well-structured 6-step release pipeline:

1. Bump version (via `mouse/scripts/mouse-version.js`)
2. Build and publish npm package (via `scripts/build.sh --npm` → `scripts/build-npm.sh`)
3. Build VSIX (via `scripts/build.sh --vsix` → `scripts/build-vsix.sh`)
4. Deploy VSIX to test repo (`~/source/repos/hic-e2e-clean`)
5. Update DynamoDB staging (`hic-plg-staging` table, `VERSION#mouse/CURRENT` record)
6. Git commit and push (development → main merge)

None of these steps modify `API_BASE_URL` or any other URL constant. The build pipeline copies and bundles source files as-is.

The VSIX build path is:

```
release-mouse.sh
  → scripts/build.sh --vsix
    → scripts/build-vsix.sh
      → cd mouse-vscode && npx vsce package --no-dependencies
        → triggers vscode:prepublish → node ./scripts/build.js
          → esbuild bundles src/extension.js → out/extension.js
          → copies licensing/, mouse/src/, mcp/src/, tools/registry/ → bundle/
```

No step in this chain performs any URL substitution, sed replacement, environment variable injection, or conditional logic based on target environment.

### H-2: Does the esbuild config support build-time constant replacement?

**No.**

`mouse-vscode/scripts/build.js` uses esbuild with a minimal configuration:

```js
const extensionBuildOptions = {
  entryPoints: [path.join(EXTENSION_DIR, "src/extension.js")],
  bundle: true,
  outfile: path.join(OUT_DIR, "extension.js"),
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node18",
  sourcemap: true,
  minify: !isWatch,
  logLevel: "info",
};
```

There is no `define` block, no `replace` plugin, no environment-variable-driven substitution. The build script also copies the `licensing/` directory verbatim into `bundle/licensing/` with no transformation.

Verified in the compiled output: `mouse-vscode/out/extension.js` contains the literal strings `"https://staging.hic-ai.com"` (from the shared `licensing/constants.js`, bundled by esbuild) and `"https://api.hic-ai.com/version"` (from the `checkForUpdates()` function in `extension.js`). Both are baked in as-is with no build-time processing.

### H-3: Was the `https://api.hic-ai.com` fallback cleaned up during Stream 1A?

**No. All three references remain.**

| # | File | Line | Value | Status |
|---|---|---|---|---|
| 1 | `mouse-vscode/src/licensing/config.js` | 10 | `API_BASE_URL: "https://api.hic-ai.com"` | Legacy config. Not imported by runtime code (see §3). Imported only by tests. |
| 2 | `mouse/src/licensing/constants.js` | 205 | `BASE_URL: process.env.HIC_LICENSE_API_BASE_URL \|\| "https://api.hic-ai.com"` | Used by MCP-side `HttpLicenseProvider`. Points to non-existent host. |
| 3 | `mouse-vscode/src/extension.js` | 829 | `fetch("https://api.hic-ai.com/version")` | Hardcoded in `checkForUpdates()`. Bypasses shared `HttpClient`. Always fails silently. |

These are documented as Known Issue #5 and Known Issue #10 in `licensing/README.md` (lines 611–617), with specific fix instructions that were never applied.

### H-4: What is the simplest mechanism to produce staging vs. production VSIX?

**No mechanism exists today.** See §6 for options analysis.

---

## 3. Runtime Architecture: What Actually Calls What

There are two independent licensing code paths in this repo. They use different modules and different URL sources.

### Path 1: VSIX Extension (esbuild-bundled into `out/extension.js`)

`mouse-vscode/src/extension.js` imports from `../../licensing/index.js` (the shared licensing core). esbuild bundles this into a single `out/extension.js`. At runtime, all licensing API calls flow through:

```
extension.js
  → imports { LicenseChecker } from "./licensing/license-checker.js"
    → imports { config, HttpClient } from "../../../licensing/index.js"
  → imports { HeartbeatManager } from "./licensing/heartbeat.js"
    → imports { config, HttpClient } from "../../../licensing/index.js"

HttpClient constructor (licensing/http-client.js L36):
  this.baseUrl = options.baseUrl || config.API_BASE_URL;
  // config.API_BASE_URL = "https://staging.hic-ai.com" (licensing/constants.js L13)
```

Every licensing API call — heartbeat, validate, activate, deactivate, trial init — goes through this single `HttpClient` → `licensing/constants.js` → `https://staging.hic-ai.com` chain.

The browser-delegated activation URL is also derived from this value:

```
licensing/constants.js L65:
  ACTIVATE_URL: `${API_BASE_URL}/activate`
  // Currently resolves to: "https://staging.hic-ai.com/activate"

licensing/commands/activate.js L51:
  return `${config.ACTIVATION.ACTIVATE_URL}?${params.toString()}`;
  // Opens browser to: https://staging.hic-ai.com/activate?key=...&fingerprint=...
```

### Path 2: MCP Server (unbundled, copied into `bundle/`)

The MCP server code lives in `mouse/src/` and gets copied verbatim into `mouse-vscode/bundle/` by `build.js`. It has its own separate licensing module at `mouse/src/licensing/`, with its own `HttpLicenseProvider` that reads from `mouse/src/licensing/constants.js`:

```
mouse/src/licensing/providers/http-provider.js L23:
  this.baseUrl = options.baseUrl || API_ENDPOINTS.BASE_URL;
  // API_ENDPOINTS.BASE_URL = process.env.HIC_LICENSE_API_BASE_URL || "https://api.hic-ai.com"
  // (mouse/src/licensing/constants.js L205)
```

This points to a non-existent host. However, the MCP-side `LicenseChecker` (`mouse/src/licensing/license-checker.js`) also imports `HeartbeatManager` from `../../../licensing/heartbeat.js` (the shared core), which uses the shared `HttpClient` → `licensing/constants.js` → `staging.hic-ai.com`. So the MCP side has a split: its `HttpLicenseProvider` points to a dead host, but its heartbeat goes through the shared core to the working host.

### Path 3: `checkForUpdates()` (standalone, bypasses everything)

`mouse-vscode/src/extension.js` line 829 has a raw `fetch()` call that bypasses the shared `HttpClient` entirely:

```js
const response = await fetch("https://api.hic-ai.com/version");
```

This always fails silently because `api.hic-ai.com` doesn't exist. The function is wired to the `Mouse: Check for Updates` command and also called from the heartbeat `onSuccess` callback — but the heartbeat path uses `readyVersion` from the heartbeat response (which works), not this function.

---

## 4. Complete File Inventory

Every file in this repo that contains a functionally relevant `hic-ai.com` URL, categorized by role.

### Category A: The One URL That Controls All Runtime API Calls

| File | Line | Value | Runtime Role |
|---|---|---|---|
| `licensing/constants.js` | 13 | `export const API_BASE_URL = "https://staging.hic-ai.com"` | Single source of truth for all licensing API calls via the shared `HttpClient`. Heartbeats, validation, activation, deactivation, trial init all go here. Also derives `ACTIVATION.ACTIVATE_URL` (L65: `` `${API_BASE_URL}/activate` ``), the URL opened in the user's browser during license activation. |

This is the only URL that matters for the staging→production switch. Change this one value to `"https://hic-ai.com"` and every API call in the VSIX extension goes to production. The browser activation URL also switches automatically.

### Category B: Dead Code / Legacy URLs (point to non-existent `api.hic-ai.com`)

| File | Line | Value | Status |
|---|---|---|---|
| `mouse-vscode/src/licensing/config.js` | 10 | `API_BASE_URL: "https://api.hic-ai.com"` | Legacy config file. Not imported by any runtime code in the esbuild bundle — the extension imports from `../../licensing/index.js` instead. Only imported by `mouse-vscode/tests/licensing.test.js` (L392 asserts this value). Dead at runtime. |
| `mouse/src/licensing/constants.js` | 205 | `BASE_URL: process.env.HIC_LICENSE_API_BASE_URL \|\| "https://api.hic-ai.com"` | Used by `mouse/src/licensing/providers/http-provider.js` (the MCP-side provider). Instantiated by `createLicenseProvider()`. Points to non-existent host. Env var override exists but defaults to dead URL. |
| `mouse-vscode/src/extension.js` | 829 | `fetch("https://api.hic-ai.com/version")` | Hardcoded in `checkForUpdates()`. Bypasses shared `HttpClient`. Always fails silently. Wired to `Mouse: Check for Updates` command. Known Issue #10 in `licensing/README.md`. |

### Category C: User-Facing URLs (already correct for production)

These are URLs shown to users in notifications, agent messages, and tool responses. They point to `https://hic-ai.com` (no subdomain) and are already correct for production. No changes needed.

| File | Lines | URLs | Context |
|---|---|---|---|
| `mouse/src/licensing/constants.js` | 236–238 | `URLS.PRICING`, `URLS.ACTIVATE`, `URLS.PORTAL` | `https://hic-ai.com/pricing`, `/activate`, `/portal` — user-facing links in MCP tool responses |
| `mouse/src/licensing/messages.js` | throughout | References `URLS.*` from above | Agent nag messages (trial reminders, expiry notices) |
| `mouse/src/licensing/tool.js` | 62–64 | Fallback URLs in `license_status` error handler | `hic-ai.com/pricing`, `/activate`, `/portal` |
| `mouse-vscode/src/licensing/messages.js` | throughout | Hardcoded `https://hic-ai.com/pricing`, `/portal/billing` | VSIX nag messages injected into agent responses |
| `mouse-vscode/src/extension.js` | 187, 265, 275, 296, 803 | `hic-ai.com/pricing`, `/portal/billing`, `/portal/devices` | VS Code notification action buttons |
| `licensing/commands/status.js` | 47, 54, 66–68 | Fallback `hic-ai.com/pricing`, `/activate`, `/portal` | Shared status command (uses `config.URLS?.PRICING \|\| "https://hic-ai.com/pricing"` pattern — the optional chaining falls through because `licensing/constants.js` has no `URLS` object, so the hardcoded production fallback is always used) |
| `licensing/commands/validate.js` | 225, 284 | Fallback `hic-ai.com/portal`, `/pricing` | Shared validate command (same fallback pattern) |
| `licensing/commands/activate.js` | 181 | `hic-ai.com/support` | CLI activation failure help message |

### Category D: Tests That Assert URL Values

| File | Line | What It Asserts | Needs Update If Remediated? |
|---|---|---|---|
| `mouse-vscode/tests/licensing.test.js` | 393 | `expect(config.API_BASE_URL).toBe("https://api.hic-ai.com")` | **Yes** — imports from `mouse-vscode/src/licensing/config.js` (Category B). If that file is cleaned up, this test must change. |
| `mouse-vscode/tests/security.test.js` | 38, 44, 49, 55, 60 | Uses `api.hic-ai.com` as example URLs for `validateHttpsUrl()` tests | **No** — these are test data for URL format validation, not config assertions. Any HTTPS URL works. |
| `mouse-vscode/tests/security.test.js` | 726–728 | `config.API_BASE_URL.startsWith("https://")` | **No** — passes for any HTTPS URL. |
| `licensing/tests/http-client.test.js` | 342–344 | `ACTIVATE_URL` contains `API_BASE_URL` and `/activate` | **No** — structural assertion, not value-specific. |
| `tools/registry/license-status.test.js` | 69 | `purchaseUrl.includes("hic-ai.com")` | **No** — already correct for production. |

### Category E: Package Metadata (not functional)

| File | Line | Value |
|---|---|---|
| `mouse-vscode/package.json` | 13 | `"homepage": "https://hic-ai.com/mouse"` |
| `packaging/v1.0.0/package.json` | 42 | `"homepage": "https://hic-ai.com"` |

No changes needed.

### Category F: Comments and JSDoc (non-functional)

| File | Line | Content |
|---|---|---|
| `mouse-vscode/src/licensing/heartbeat.js` | 4 | JSDoc: `Manages periodic heartbeats to api.hic-ai.com` |
| `mouse/src/licensing/providers/http-provider.js` | 6, 9 | JSDoc: `Makes API calls to api.hic-ai.com` |
| `mouse-vscode/bundle/licensing/http-client.js` | 31 | JSDoc: `@param {string} [options.baseUrl] - API base URL (default: api.hic-ai.com)` |

These are inaccurate (the actual runtime URL is `staging.hic-ai.com`, not `api.hic-ai.com`) and should be corrected during cleanup, but they have no runtime effect.

---

## 5. The `config.URLS` Fallback Pattern

A subtle architectural detail worth noting: the shared `licensing/commands/status.js` references `config.URLS?.PRICING` with optional chaining and a hardcoded fallback:

```js
import config from "../constants.js";
// config = licensing/constants.js — which has NO URLS object

purchaseUrl: config.URLS?.PRICING || "https://hic-ai.com/pricing",
activateUrl: config.URLS?.ACTIVATE || "https://hic-ai.com/activate",
portalUrl: config.URLS?.PORTAL || "https://hic-ai.com/portal",
```

The `URLS` object exists only in `mouse/src/licensing/constants.js` (the MCP-side constants), not in the shared `licensing/constants.js`. So the optional chaining always returns `undefined`, and the hardcoded production fallbacks are always used. This is correct behavior but accidental — the code was written expecting `config.URLS` to exist. The same pattern appears in `licensing/commands/validate.js`.

This means the shared commands always emit production URLs regardless of which `API_BASE_URL` is configured. This is the right outcome (user-facing URLs should always point to production), but it's achieved through a happy accident rather than intentional design.

---

## 6. Options for H-4: Staging vs. Production VSIX

### Option A: Point everything at production, use env var for local staging testing

Change `licensing/constants.js` L13 from `"https://staging.hic-ai.com"` to `"https://hic-ai.com"`. Clean up the three dead `api.hic-ai.com` references. Ship.

For local staging testing, add env var support to the shared `HttpClient` (it currently has none — only the MCP-side `HttpLicenseProvider` supports `HIC_LICENSE_API_BASE_URL`):

```js
// licensing/constants.js L13 (after change):
export const API_BASE_URL =
  (typeof process !== "undefined" && process.env?.HIC_API_BASE_URL) ||
  "https://hic-ai.com";
```

This lets SWR test against staging by launching VS Code with `HIC_API_BASE_URL=https://staging.hic-ai.com` when needed. The shipped VSIX always targets production.

**Scope:** ~5 files changed, ~30 minutes work including test updates.

**Pros:**
- Minimal change. One source of truth. No build pipeline modifications.
- All shipped artifacts (VSIX, npm package) always target production.
- Env var override provides escape hatch for staging testing without code changes.
- Passes code quality audit — no hardcoded staging URLs in production artifacts.

**Cons:**
- No automated staging VSIX build. If you ever need a VSIX that targets staging by default (e.g., for a QA team), you'd need to add a build-time mechanism later.
- The env var override changes the `ACTIVATION.ACTIVATE_URL` too (since it's derived from `API_BASE_URL` at module load time), which means browser activation would open `staging.hic-ai.com/activate` when the env var is set. This is correct behavior for staging testing.

### Option B: Add esbuild `define` for build-time URL injection

Add a `define` block to `mouse-vscode/scripts/build.js`:

```js
define: {
  'process.env.HIC_API_BASE_URL': JSON.stringify(
    process.env.HIC_API_BASE_URL || "https://hic-ai.com"
  ),
},
```

And update `licensing/constants.js` to read from `process.env.HIC_API_BASE_URL`.

**Scope:** ~6 files changed, ~45 minutes work.

**Pros:**
- Build-time injection is a standard esbuild pattern.
- Could produce staging and production VSIXes from the same source.

**Cons:**
- Only affects the esbuild-bundled `out/extension.js`. The `bundle/` directory (MCP server code) is copied verbatim and would need a separate mechanism.
- Adds complexity to the build pipeline for a capability that isn't currently needed.
- The `ACTIVATION.ACTIVATE_URL` is computed at module load time from `API_BASE_URL`, so the `define` must be processed before that template literal evaluates. This works with esbuild `define` (it's a compile-time replacement), but it's a subtle dependency.

### Option C: Maintain separate staging and production constants files

Create `licensing/constants.production.js` and `licensing/constants.staging.js`, with a build script that copies the appropriate one.

**Not recommended.** This creates a maintenance burden (two files to keep in sync), adds error-prone build logic, and solves a problem that doesn't exist — you don't need separate VSIX builds for staging and production.

### Recommendation

**Option A.** It's the simplest correct solution. It aligns with SWR's stated plan: staging is allowlisted to SWR's machine, production is the default, and there's no need for the extension to distinguish environments at runtime. The env var override provides a clean escape hatch without polluting the production build.

---

## 7. Detailed Remediation Plan (If Option A Is Chosen)

### Step 1: Change the production URL (Category A)

**File:** `licensing/constants.js` L13

```js
// Before:
export const API_BASE_URL = "https://staging.hic-ai.com";

// After:
export const API_BASE_URL =
  (typeof process !== "undefined" && process.env?.HIC_API_BASE_URL) ||
  "https://hic-ai.com";
```

This single change switches all licensing API calls to production and adds env var override support. The `ACTIVATION.ACTIVATE_URL` (L65) automatically updates because it's derived from `API_BASE_URL`.

### Step 2: Clean up dead `api.hic-ai.com` references (Category B)

**File 1:** `mouse-vscode/src/licensing/config.js` L10

```js
// Before:
API_BASE_URL: "https://api.hic-ai.com",

// After:
API_BASE_URL: "https://hic-ai.com",
```

Or consider deleting this file entirely if nothing imports it at runtime. The test that imports it (`licensing.test.js` L392) would need to be updated or redirected to import from the shared `licensing/constants.js` instead.

**File 2:** `mouse/src/licensing/constants.js` L205

```js
// Before:
BASE_URL: process.env.HIC_LICENSE_API_BASE_URL || "https://api.hic-ai.com",

// After:
BASE_URL: process.env.HIC_LICENSE_API_BASE_URL || "https://hic-ai.com",
```

Note: This uses a different env var name (`HIC_LICENSE_API_BASE_URL`) than the one proposed for the shared constants (`HIC_API_BASE_URL`). Consider aligning these to use the same env var name for consistency.

**File 3:** `mouse-vscode/src/extension.js` L829

The `checkForUpdates()` function (L819–858) should either:
- (a) Be removed entirely (the heartbeat-based update check in `startHeartbeatWithCallbacks()` already handles version notifications via `readyVersion`), or
- (b) Be rewritten to use the shared `HttpClient` and a proper `/api/version` endpoint on the production API.

Option (a) is simpler and eliminates dead code. The `Mouse: Check for Updates` command registration (in `registerCommands()`) would also need to be removed or rewired.

### Step 3: Update tests (Category D)

**File:** `mouse-vscode/tests/licensing.test.js` L392–393

```js
// Before:
it("should have api.hic-ai.com as base URL", () => {
  expect(config.API_BASE_URL).toBe("https://api.hic-ai.com");
});

// After:
it("should have hic-ai.com as base URL", () => {
  expect(config.API_BASE_URL).toBe("https://hic-ai.com");
});
```

### Step 4: Fix inaccurate comments (Category F)

Update JSDoc in `mouse-vscode/src/licensing/heartbeat.js` L4, `mouse/src/licensing/providers/http-provider.js` L6/L9, and `licensing/http-client.js` L31 to reference the correct URL.

### Step 5: Rebuild and verify

Run `scripts/build.sh --vsix` and inspect the compiled output:
- `mouse-vscode/out/extension.js` should contain `"https://hic-ai.com"` (not `staging` or `api`)
- `mouse-vscode/bundle/licensing/constants.js` should contain `"https://hic-ai.com"`
- `mouse-vscode/bundle/mouse/src/licensing/constants.js` should contain `"https://hic-ai.com"`

### Estimated effort

| Step | Files | Time |
|---|---|---|
| 1. Change production URL | 1 | 2 min |
| 2. Clean up dead references | 3 | 10 min |
| 3. Update tests | 1 | 5 min |
| 4. Fix comments | 3 | 5 min |
| 5. Rebuild and verify | 0 | 10 min |
| **Total** | **8 files** | **~30 min** |

---

## 8. Relationship to Companion Report

The companion report (`20260222_API_BASE_URL_AND_PROD_NAMING_INVESTIGATION.md`, completed in the Website repo) identified two issues:

1. **`prod` vs. `production` naming split** — a Website repo / CloudFormation issue. Unaffected by anything in this repo.
2. **Extension API_BASE_URL for production VSIX** — the issue addressed by this memo.

The two issues intersect at one point: the production URL. The Website repo's CloudFormation `IsProduction` condition ensures that `https://hic-ai.com` (not `https://prod.hic-ai.com`) is the production domain. This memo's remediation points the extension at that same domain. The issues can be worked independently.

This memo completes the `hic` repo investigation flagged in §6 of the companion report. All four questions (H-1 through H-4) are now answered. Decision B-D8 from the pre-launch status assessment (`20260216_PRE_LAUNCH_STATUS_ASSESSMENT_AND_ACTION_PLANS.md` L231) is resolved: the production API base URL should be `https://hic-ai.com`.

---

## 9. Decisions Needed from SWR

| # | Decision | Options | Recommendation | Blocks |
|---|---|---|---|---|
| D-1 | Which remediation option? | (A) Point to production + env var override. (B) esbuild `define`. (C) Separate constants files. | Option A | Phase 4 Step 4D |
| D-2 | Remove `checkForUpdates()` or fix it? | (a) Remove dead code + command. (b) Rewrite to use shared `HttpClient` + new `/api/version` route. | (a) Remove — heartbeat-based updates already work | Phase 4 Step 4D |
| D-3 | Align env var names? | `HIC_API_BASE_URL` (shared) vs. `HIC_LICENSE_API_BASE_URL` (MCP-side) — use one name for both? | Yes, align to `HIC_API_BASE_URL` | Cleanup only |
| D-4 | Delete `mouse-vscode/src/licensing/config.js`? | (a) Delete entirely (nothing imports it at runtime). (b) Update URL and keep for potential future use. | (a) Delete — it's dead code that creates confusion | Cleanup only |

---

## Appendix: Files Examined

All findings verified against these source files (read directly, not from documentation):

**Build pipeline (4):**
`scripts/release-mouse.sh`, `scripts/build.sh`, `scripts/build-vsix.sh`, `mouse-vscode/scripts/build.js`

**Build manifest (1):**
`scripts/dist-manifest.json`

**Shared licensing core (5):**
`licensing/constants.js`, `licensing/http-client.js`, `licensing/index.js`, `licensing/heartbeat.js`, `licensing/commands/activate.js`

**Shared licensing commands (2):**
`licensing/commands/status.js`, `licensing/commands/validate.js`

**VSIX extension source (5):**
`mouse-vscode/src/extension.js`, `mouse-vscode/src/licensing/config.js`, `mouse-vscode/src/licensing/license-checker.js`, `mouse-vscode/src/licensing/heartbeat.js`, `mouse-vscode/src/licensing/validation.js`

**VSIX extension messages (1):**
`mouse-vscode/src/licensing/messages.js`

**MCP server licensing (5):**
`mouse/src/licensing/constants.js`, `mouse/src/licensing/index.js`, `mouse/src/licensing/license-checker.js`, `mouse/src/licensing/providers/http-provider.js`, `mouse/src/licensing/providers/index.js`

**MCP server messages and tool (2):**
`mouse/src/licensing/messages.js`, `mouse/src/licensing/tool.js`

**Tests (3):**
`mouse-vscode/tests/licensing.test.js`, `mouse-vscode/tests/security.test.js`, `licensing/tests/http-client.test.js`

**Compiled output (1):**
`mouse-vscode/out/extension.js`

**Bundle output (3):**
`mouse-vscode/bundle/licensing/constants.js`, `mouse-vscode/bundle/mouse/src/licensing/constants.js`, `mouse-vscode/bundle/licensing/README.md`

**Package metadata (2):**
`mouse-vscode/package.json`, `packaging/v1.0.0/package.json`

---

*This memo completes the `hic` repo investigation flagged in §6 of the companion report. Combined with the companion report, all aspects of the API_BASE_URL and `prod`→`production` naming investigation are now resolved. Remediation can proceed when SWR is ready.*

