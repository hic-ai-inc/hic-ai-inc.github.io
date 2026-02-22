# API_BASE_URL and `prod` → `production` Naming Investigation

**Date:** 2026-02-22
**Author:** Kiro (source code investigation, verified against actual files)
**Owner:** SWR
**Status:** Investigation complete — pending SWR review and decisions
**Context:** Phase 0 item 0.4 (API_BASE_URL investigation) and Phase 4 P0 (naming standardization). This memo resolves open decision B-D8 and provides the factual basis for the P0 naming work.

**Methodology:** Every finding below was verified by reading actual source code in the `hic-ai-inc.github.io` repo. No finding relies solely on prior planning documents, which may contain AI-degraded output. Files in the `.hic/` directory (copies of extension code from the `hic` repo) were read directly. The `hic` repo's build scripts (`release-mouse.sh`, esbuild config) could not be examined from this workspace and are flagged as open items requiring investigation in that repo.

---

## 1. Summary

Two distinct issues were conflated under "API_BASE_URL investigation" in the planning documents. They are related but separate, with different scopes and risk profiles:

1. **`prod` vs. `production` naming split** — a naming inconsistency between CloudFormation/infrastructure (uses `prod`) and Next.js app/Cognito scripts (uses `production`). Currently functional but creates confusion and rename risk.

2. **Extension API_BASE_URL for production VSIX** — the Mouse extension hardcodes `https://staging.hic-ai.com` as its API endpoint. The production VSIX needs `https://hic-ai.com`. The mechanism for switching this at build time is in the `hic` repo and has not yet been examined.

Neither issue is an architectural surprise. Both are well-bounded. Combined estimated effort: 3–6 hours.

---

## 2. Issue 1: The `prod` → `production` Naming Split

### 2.1 What the code actually says

Two naming conventions coexist across the codebase. They do not currently conflict at runtime because the two systems don't share the environment string directly, but they create confusion and rename risk.

#### Convention A: `prod` (CloudFormation + infrastructure scripts)

| File | What it says | Line(s) |
|---|---|---|
| `plg-website/infrastructure/cloudformation/plg-main-stack.yaml` | `AllowedValues: [dev, staging, prod]` | 22–24 |
| `plg-website/infrastructure/cloudformation/plg-iam.yaml` | `AllowedValues: [dev, staging, prod]` | 19–21 |
| `plg-website/infrastructure/cloudformation/plg-ses.yaml` | `AllowedValues: [dev, staging, prod]` | 19–21 |
| `plg-website/infrastructure/cloudformation/plg-compute.yaml` | `AllowedValues: [dev, staging, prod]` | 18–20 |
| `plg-website/infrastructure/cloudformation/plg-dynamodb.yaml` | `AllowedValues: [dev, staging, prod]` | 21–23 |
| `plg-website/infrastructure/cloudformation/plg-messaging.yaml` | `AllowedValues: [dev, staging, prod]` | 17–19 |
| `plg-website/infrastructure/cloudformation/plg-scheduled.yaml` | `AllowedValues: [dev, staging, prod]` | 18–20 |
| `plg-website/infrastructure/cloudformation/plg-monitoring.yaml` | `AllowedValues: [dev, staging, prod]` | 18–20 |
| `plg-website/infrastructure/cloudformation/plg-cognito.yaml` | `AllowedValues: [dev, staging, prod]` | 21–23 |
| `plg-website/infrastructure/deploy.sh` | Validates `dev\|staging\|prod` | L111, L128–129 |
| `plg-website/infrastructure/update-lambdas.sh` | Validates `dev\|staging\|prod` | L124, L139–140 |
| `plg-website/infrastructure/parameters/prod.json` | `"ParameterValue": "prod"` | L4 |
| `plg-website/infrastructure/parameters/prod.json` | S3 buckets: `hic-plg-templates-prod`, `hic-plg-lambda-prod` | L8, L20 |

All 9 CF templates define `IsProduction: !Equals [!Ref Environment, prod]`. This condition gates:
- SES email identity domain (`hic-ai.com` vs. `staging.hic-ai.com`)
- SES MAIL FROM domain
- AppUrl passed to Lambda functions
- SESFromEmail passed to Lambda functions
- Scheduled rule state (ENABLED vs. DISABLED)
- Alert email subscription (production only)

#### Convention B: `production` (Next.js app + Cognito script + Secrets Manager)

| File | What it says | Line(s) |
|---|---|---|
| `plg-website/scripts/setup-cognito.sh` | `if [ "$ENVIRONMENT" = "production" ]` | L34 |
| `plg-website/src/lib/secrets.js` | Detects `"staging"` or `"production"` (never `"prod"`) | L33–37 |
| `plg-website/src/lib/secrets.js` | Secrets Manager paths: `plg/${ENVIRONMENT}/stripe` where ENVIRONMENT = `"production"` | L41–44 |
| `plg-website/scripts/manage-ssm-secrets.sh` | Hardcodes `SM_STRIPE_PATH="plg/staging/stripe"` | L42 |

#### Convention C: Lambda fallback logic (bridges both)

| File | What it says | Line(s) |
|---|---|---|
| `plg-website/infrastructure/lambda/email-sender/index.js` | `ENVIRONMENT === "prod" ? "" : ENVIRONMENT + "."` | L64 |
| `plg-website/infrastructure/lambda/scheduled-tasks/index.js` | `ENVIRONMENT === "prod" ? "" : ENVIRONMENT + "."` | L65 |

The Lambda functions receive `ENVIRONMENT=prod` from CloudFormation (via `plg-compute.yaml` env vars) and use the ternary to construct URLs correctly. This works.

### 2.2 Why it works today (and why it's fragile)

The split works because the two naming conventions operate in isolated contexts:

1. CloudFormation passes `prod` to Lambda env vars. Lambdas check `=== "prod"` in their URL construction. This is self-consistent.
2. The Next.js app detects its environment from `NEXT_PUBLIC_APP_URL` (does the URL contain "staging"?), not from the CF parameter. It resolves to `"production"` and uses that for Secrets Manager paths like `plg/production/stripe`.
3. The Cognito setup script is run manually and has its own hardcoded `ENVIRONMENT="staging"` (the bug flagged in item 0.5).

The fragility: if someone renames `prod` → `production` in CloudFormation without updating every `IsProduction` condition and every Lambda ternary, the system breaks silently. The `IsProduction` condition would evaluate to `false` for `"production"` because it checks `!Equals [!Ref Environment, prod]`. SES would try to create an identity for `production.hic-ai.com` instead of `hic-ai.com`. Lambda URLs would resolve to `https://production.hic-ai.com` instead of `https://hic-ai.com`. This is exactly the concern SWR originally flagged.

### 2.3 SWR's original concern — verified

SWR's recollection was that `https://${ENVIRONMENT}.hic-ai.com` would produce `https://production.hic-ai.com` (wrong) or `https://.hic-ai.com` (if null). This concern is valid but already mitigated in the current code:

- CF templates use `!If [IsProduction, ...]` to branch between `hic-ai.com` and `${Environment}.hic-ai.com`
- Lambda code uses `ENVIRONMENT === "prod" ? "" : ENVIRONMENT + "."` to avoid the extra dot

The mitigation depends on the environment value being exactly `"prod"`. If renamed to `"production"` without updating these checks, the mitigation breaks and the original concern materializes.

### 2.4 Full scope of a `prod` → `production` rename

If SWR decides to standardize on `production`:

| Category | Files | Changes | Effort |
|---|---|---|---|
| CF template AllowedValues | 9 YAML files | Change `prod` → `production` in each | 15 min |
| CF template Conditions | 4 YAML files (ses, scheduled, monitoring, main-stack) | Change `!Equals [!Ref Environment, prod]` → `!Equals [!Ref Environment, production]` | 10 min |
| Deploy script | `deploy.sh` | Update regex and confirmation check | 5 min |
| Update-lambdas script | `update-lambdas.sh` | Update regex | 5 min |
| Parameter file | `parameters/prod.json` | Rename to `production.json`, change ParameterValue | 5 min |
| S3 bucket names in parameter file | `parameters/prod.json` (or `production.json`) | `hic-plg-templates-prod` → `hic-plg-templates-production` | 2 min (file change) |
| S3 bucket migration | AWS Console/CLI | **Cannot rename S3 buckets.** Must create new buckets, copy content, update references, delete old buckets. | 30–45 min |
| Lambda URL fallback | `email-sender/index.js`, `scheduled-tasks/index.js` | Change `=== "prod"` → `=== "production"` | 5 min |
| Infrastructure tests | `cloudformation.test.js`, `parameters.test.js`, `deploy.test.js` | Update all `prod` references | 15 min |
| Unit tests | `secrets.test.js` | Update `non-prod` references in test descriptions | 5 min |
| **Total** | **~20 files** | | **1.5–2.5 hours** |

The S3 bucket migration is the only non-trivial part. Everything else is mechanical find-and-replace with verification.

### 2.5 Alternative: Leave `prod` as-is

The current system works. `prod` is a common, valid convention for CloudFormation environments. Many AWS teams use short names (`dev`, `staging`, `prod`) in CF and longer names elsewhere. The split is confusing but not broken.

If left as-is, the only action needed is documentation: a note in the deploy script or a README stating that CF uses `prod` while the Next.js app uses `production`, and that these must not be conflated.

---

## 3. Issue 2: Extension API_BASE_URL for Production VSIX

### 3.1 What the code actually says (verified in this repo)

The shared licensing core (`.hic/licensing/constants.js` L13):
```js
export const API_BASE_URL = "https://staging.hic-ai.com";
```

The `HttpClient` (`.hic/licensing/http-client.js` L36) defaults to this:
```js
this.baseUrl = options.baseUrl || config.API_BASE_URL;
```

The mouse-specific constants (`.hic/mouse/src/licensing/constants.js` L207–208):
```js
BASE_URL: process.env.HIC_LICENSE_API_BASE_URL || "https://api.hic-ai.com",
```

The `ACTIVATION.ACTIVATE_URL` (`.hic/licensing/constants.js` L65) is derived from `API_BASE_URL`:
```js
ACTIVATE_URL: `${API_BASE_URL}/activate`,
```

### 3.2 Three API base URLs exist in the extension codebase

| Location | Value | Status |
|---|---|---|
| `.hic/licensing/constants.js` L13 | `https://staging.hic-ai.com` | Hardcoded. Used by `HttpClient` for all licensing API calls. Currently correct for staging. |
| `.hic/mouse/src/licensing/constants.js` L208 | `https://api.hic-ai.com` | Env var override with non-existent host as fallback. Per the heartbeat analysis (§2.4, §4.4), this URL is used by the now-removed `checkForUpdates()` path, not by heartbeats. |
| `.hic/mouse/src/licensing/constants.js` L236–238 (URLS object) | `https://hic-ai.com/pricing`, `https://hic-ai.com/activate`, `https://hic-ai.com/portal` | Hardcoded production URLs for user-facing links. These are correct for production but wrong for staging testing. |

### 3.3 The production VSIX problem

When building a production VSIX for Marketplace distribution, `.hic/licensing/constants.js` line 13 must change from `https://staging.hic-ai.com` to `https://hic-ai.com`. This is the URL that all licensing API calls (validate, activate, deactivate, heartbeat, trial init) use.

The mechanism for making this change at build time — whether via esbuild `define`, a sed replacement in a release script, or manual edit-build-revert — lives in the `hic` repo. The files to examine are:

1. `release-mouse.sh` (or equivalent build/release script)
2. The esbuild configuration (likely `esbuild.config.js` or similar)
3. Any `package.json` scripts that invoke the build

### 3.4 What cannot be verified from this workspace

- Whether `release-mouse.sh` exists and what it does
- Whether the esbuild config has a `define` block for `API_BASE_URL`
- Whether there is any existing mechanism to produce a staging vs. production VSIX from the same source
- The current state of the `api.hic-ai.com` fallback URL — whether it was cleaned up during the Stream 1A heartbeat fixes or still exists

These are the open questions for the `hic` repo investigation.

---

## 4. Relationship Between the Two Issues

The two issues intersect at one point: the production URL.

- Issue 1 determines that the production website URL is `https://hic-ai.com` (not `https://prod.hic-ai.com` or `https://production.hic-ai.com`). This is already correctly handled by the `IsProduction` condition in CloudFormation.
- Issue 2 requires the extension to point to `https://hic-ai.com` for its API calls. The extension doesn't care whether CloudFormation calls the environment `prod` or `production` — it just needs the correct URL baked in at build time.

The issues can be worked independently. Renaming `prod` → `production` in CloudFormation does not affect the extension build. Fixing the extension's API_BASE_URL does not require the CloudFormation rename.

---

## 5. Recommendations

### 5.1 Issue 2 first (extension API_BASE_URL) — investigate in `hic` repo

Open the `hic` repo and answer three questions:

1. Does `release-mouse.sh` (or equivalent) exist, and does it modify `API_BASE_URL` during the build?
2. Does the esbuild config have a `define` or `replace` mechanism for environment-specific constants?
3. What is the simplest path to producing a production VSIX with `https://hic-ai.com` as the API base?

Estimated investigation time: 15–30 minutes. This resolves B-D8 completely.

### 5.2 Issue 1 (prod → production rename) — decide, don't defer

SWR should make a decision now, even if execution is deferred to Phase 4:

**Option A: Rename `prod` → `production` during Phase 4 P0.**
- Pro: Eliminates the naming split permanently. Reduces cognitive load and rename risk for all future infrastructure work.
- Con: S3 bucket migration adds 30–45 minutes. Must be done atomically with the production stack deployment to avoid breaking the staging stack.
- Estimated effort: 2–3 hours during Phase 4.

**Option B: Keep `prod` in CloudFormation. Document the convention split.**
- Pro: Zero work. System works as-is. `prod` is a common CF convention.
- Con: The naming split persists. Future contributors (human or AI) may conflate the two conventions and break the `IsProduction` condition.
- Estimated effort: 15 minutes (write a note in the deploy script header).

**My lean:** Option B for launch, Option A post-launch. The rename is real work with real risk (S3 migration, atomic multi-file update across 20 files, test updates). Doing it during the pre-launch sprint adds risk for zero user-facing benefit. The current system works. Document it, ship, and standardize when there's breathing room.

### 5.3 Do not create a new Stream 1E

Both issues are already correctly placed in the existing plan:
- Issue 2 → Phase 4 Step 4D ("Build production VSIX with correct API_BASE_URL")
- Issue 1 → Phase 4 Step 4A P0 ("Naming standardization")

The investigation we just completed is the Phase 0 item 0.4 deliverable. No plan restructuring is needed.

---

## 6. Open Items for `hic` Repo Investigation

These questions must be answered by examining source code in `~/source/repos/hic`:

| # | Question | Files to examine | Expected effort |
|---|---|---|---|
| H-1 | Does a release/build script exist that modifies `API_BASE_URL`? | `release-mouse.sh`, `package.json` scripts | 10 min |
| H-2 | Does the esbuild config support build-time constant replacement? | `esbuild.config.js` or equivalent | 10 min |
| H-3 | Was the `https://api.hic-ai.com` fallback cleaned up during Stream 1A? | `mouse-vscode/src/licensing/config.js` (if it still exists) | 5 min |
| H-4 | What is the simplest mechanism to produce staging vs. production VSIX? | Depends on H-1 and H-2 findings | 5–15 min |

Total estimated investigation time in `hic` repo: 30 minutes.

---

## 7. Decisions Needed from SWR

| # | Decision | Options | Recommendation | Blocks |
|---|---|---|---|---|
| D-1 | Rename `prod` → `production` in CloudFormation? | (A) Yes, during Phase 4 P0. (B) No, document the split and defer. | Option B for launch | Phase 4 P0 scope |
| D-2 | Proceed with `hic` repo investigation for Issue 2? | Yes / No | Yes — 30 minutes, resolves B-D8 | Phase 4 Step 4D |

---

## Appendix: Files Examined

All findings verified against these source files (read directly, not from documentation):

**CloudFormation templates (9):**
`plg-website/infrastructure/cloudformation/plg-main-stack.yaml`, `plg-iam.yaml`, `plg-ses.yaml`, `plg-compute.yaml`, `plg-dynamodb.yaml`, `plg-messaging.yaml`, `plg-scheduled.yaml`, `plg-monitoring.yaml`, `plg-cognito.yaml`

**Infrastructure scripts (2):**
`plg-website/infrastructure/deploy.sh`, `plg-website/infrastructure/update-lambdas.sh`

**Parameter files (2):**
`plg-website/infrastructure/parameters/prod.json`, `plg-website/infrastructure/parameters/staging.json`

**Lambda source (2):**
`plg-website/infrastructure/lambda/email-sender/index.js`, `plg-website/infrastructure/lambda/scheduled-tasks/index.js`

**Next.js source (4):**
`plg-website/src/lib/secrets.js`, `plg-website/src/lib/constants.js`, `plg-website/src/lib/cognito.js`, `plg-website/src/lib/ses.js`

**Scripts (3):**
`plg-website/scripts/setup-cognito.sh`, `plg-website/scripts/setup-stripe-portal.js`, `plg-website/scripts/manage-ssm-secrets.sh`

**Extension licensing code (3, from `.hic/` mirror):**
`.hic/licensing/constants.js`, `.hic/licensing/http-client.js`, `.hic/mouse/src/licensing/constants.js`

**E2E test config (1):**
`plg-website/__tests__/e2e/config.js`

---

*This memo completes Phase 0 item 0.4 (Production API_BASE_URL investigation). The 30-minute investigation cap was respected for the `hic-ai-inc.github.io` repo. The `hic` repo investigation (§6) remains as a follow-up task.*
