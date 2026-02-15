# Audit Report: Secrets Hygiene for PLG Website

**Date:** 2026-02-15
**Author:** GitHub Copilot (GC) with SWR
**Classification:** Security — CWE-312 (Cleartext Storage of Sensitive Information)
**Status:** ✅ All 4 findings remediated and E2E-validated (2026-02-15)
**Branch:** `development`

---

## 1. Executive Summary

A comprehensive secrets hygiene audit was conducted across all secret storage locations used by the PLG website: AWS SSM Parameter Store, AWS Secrets Manager, Amplify environment variables, and GitHub Actions Secrets. The audit identified **one genuine security issue** (a Stripe test API key stored in plaintext in Amplify environment variables), **one legacy artifact** (a 25-key mega-secret in Secrets Manager that no code references), and **architectural concerns** around dual-storage and fallback patterns that will become liabilities when we deploy to production.

The good news: the core secrets architecture is sound. Secrets Manager and SSM Parameter Store are used correctly with proper encryption. The structured logging adapter (`api-log`) already sanitizes sensitive field names. The issues are peripheral and fixable without code changes to the secrets resolution chain itself.

**Phase 1 Update (2026-02-15):** FINDING-1 (Stripe test key in Amplify env vars) and FINDING-2 (legacy mega-secret) have been remediated. `E2E_STRIPE_TEST_KEY` was removed from both app-level and branch-level Amplify environment variables. `plg/staging/env` was soft-deleted from Secrets Manager with a 30-day recovery window (recoverable until 2026-03-17).

**Phase 2 Update (2026-02-15):** FINDING-3 and FINDING-4 have been remediated via code changes to `secrets.js`. Secrets Manager is now the canonical source with SSM as legacy fallback. The emergency `process.env` fallback was replaced with `throw new Error()` in all 3 production-path functions. During CI/CD validation, a latent environment gate bug was discovered and fixed: `=== "development"` was flipped to `!== "production"` so that CI (where `NODE_ENV` is `undefined`) takes the safe `process.env` path instead of hitting AWS.

**Validation (2026-02-15):** All 1415 tests passing. CI/CD Code Quality Gate passed (commit `42185f3`). Full E2E purchase flow validated on `staging.hic-ai.com` — checkout, Stripe payment, license provisioning, activation in Codespaces, admin portal verification. CloudWatch structured logs confirmed operational with correct correlation IDs and log levels.

---

## 2. Scope

### Locations Audited

| Storage Location | Access Method | Encryption |
|-----------------|---------------|------------|
| SSM Parameter Store (`/plg/secrets/d2yhz9h4xdd5rb/*`) | AWS SDK at runtime | ✅ KMS (SecureString) |
| Secrets Manager (`plg/staging/*`) | AWS SDK at runtime | ✅ AES-256 |
| Amplify App-Level Env Vars | `process.env` at build + runtime | ❌ Plaintext |
| Amplify Branch-Level Env Vars | `process.env` at build + runtime | ❌ Plaintext |
| GitHub Actions Secrets | `${{ secrets.* }}` at CI time | ✅ Encrypted |

### Files Reviewed

| File | Purpose |
|------|---------|
| `plg-website/src/lib/secrets.js` (413 lines) | Secret resolution chain (SSM → Secrets Manager → env) |
| `plg-website/src/lib/stripe.js` | Stripe client initialization using cached secrets |
| `plg-website/src/lib/keygen.js` | Keygen client using product token |
| `plg-website/src/app/api/license/trial/init/route.js` | Trial token secret usage |
| `plg-website/src/app/api/admin/provision-test-license/route.js` | Admin key usage |
| `plg-website/scripts/manage-ssm-secrets.sh` | SSM secret management |
| `plg-website/scripts/update-amplify-env.sh` | Amplify env var updates |
| `plg-website/scripts/backup-amplify-env.sh` | Amplify env var backups |
| `.github/workflows/cicd.yml` | CI/CD pipeline with secrets injection |

---

## 3. Complete Secrets Inventory

### 3.1 SSM Parameter Store

Path format: `/plg/secrets/d2yhz9h4xdd5rb/{KEY}`

| Parameter | Type | Used By Code | Notes |
|-----------|------|:---:|-------|
| `STRIPE_SECRET_KEY` | SecureString | ✅ `secrets.js` → `stripe.js` | Primary source for Stripe API key |
| `STRIPE_WEBHOOK_SECRET` | SecureString | ✅ `secrets.js` → `stripe.js` | Primary source for webhook verification |
| `KEYGEN_PRODUCT_TOKEN` | SecureString | ✅ `secrets.js` → `keygen.js` | Primary source for Keygen API token |
| `KEYGEN_POLICY_ID_INDIVIDUAL` | SecureString | ✅ `secrets.js` | Policy ID for individual licenses |
| `KEYGEN_POLICY_ID_BUSINESS` | SecureString | ✅ `secrets.js` | Policy ID for business licenses |

**Verdict: ✅ All properly encrypted. No issues.**

### 3.2 AWS Secrets Manager

| Secret Name | Keys Contained | Used By Code | Notes |
|-------------|:---:|:---:|-------|
| `plg/staging/stripe` | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | ✅ Fallback in `getStripeSecrets()` | Duplicates SSM entries |
| `plg/staging/keygen` | `KEYGEN_PRODUCT_TOKEN` | ✅ Fallback in `getKeygenSecrets()` | Duplicates SSM entry |
| `plg/staging/app` | `TRIAL_TOKEN_SECRET`, `TEST_ADMIN_KEY` | ✅ `getAppSecrets()` | Only source for these secrets |
| **`plg/staging/env`** | **25 keys (see §4.2)** | **❌ Not referenced by any code** | **Legacy artifact** |

### 3.3 Amplify Environment Variables

Source: `aws amplify get-branch` (branch-level, which is the runtime source)

#### Non-Secret Configuration (Safe in Env Vars)

| Variable | Value | Notes |
|----------|-------|-------|
| `AMPLIFY_MONOREPO_APP_ROOT` | `plg-website` | Build config |
| `DYNAMODB_REGION` | `us-east-1` | Region config |
| `DYNAMODB_TABLE_NAME` | `hic-plg-staging` | Table name |
| `KEYGEN_ACCOUNT_ID` | `868fccd3-...` | Public account ID |
| `NEXT_PUBLIC_APP_URL` | `https://staging.hic-ai.com` | Public URL |
| `NEXT_PUBLIC_COGNITO_CLIENT_ID` | `3jobildap1dobb5vfmiul47bvc` | Public client ID |
| `NEXT_PUBLIC_COGNITO_DOMAIN` | `mouse-staging-v2.auth...` | Public domain |
| `NEXT_PUBLIC_COGNITO_USER_POOL_ID` | `us-east-1_CntYimcMm` | Public pool ID |
| `NEXT_PUBLIC_STRIPE_PRICE_*` (4 vars) | `price_1Suh...` | Public price IDs |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_test_51Ss...` | Public key (by design) |
| `SES_FROM_EMAIL` | `noreply@staging.hic-ai.com` | Email config |

#### Problematic: Secret Material in Env Vars

| Variable | Classification | Risk |
|----------|---------------|------|
| **`E2E_STRIPE_TEST_KEY`** | `sk_test_*` — **Stripe Secret API Key** | **HIGH** — See §4.1 |
| `KEYGEN_POLICY_ID_INDIVIDUAL` | UUID | Low — also in SSM SecureString |
| `KEYGEN_POLICY_ID_BUSINESS` | UUID | Low — also in SSM SecureString |
| `KEYGEN_WEBHOOK_PUBLIC_KEY` | Ed25519 public key | None — public keys are not secrets |

### 3.4 GitHub Actions Secrets

| Secret | Used In CI/CD Step | Notes |
|--------|--------------------|-------|
| `STRIPE_TEST_SECRET_KEY` → `E2E_STRIPE_TEST_KEY` | E2E tests | ✅ Properly encrypted |
| `KEYGEN_TEST_API_KEY` → `E2E_KEYGEN_TEST_KEY` | E2E tests | ✅ Properly encrypted |
| `AWS_ROLE_ARN_STAGING` | OIDC role assumption | ✅ Properly encrypted |

---

## 4. Findings

### 4.1 FINDING-1: Stripe Secret Key in Plaintext Amplify Env Vars

**Severity:** HIGH
**CWE:** CWE-312 — Cleartext Storage of Sensitive Information
**Affected Resource:** Amplify environment variable `E2E_STRIPE_TEST_KEY`

#### Description

A Stripe test-mode secret API key (`sk_test_51SsU8D...`) is stored in plaintext in both the Amplify app-level and branch-level environment variables. This key grants full API access to the Stripe test-mode account, including the ability to create charges, read customer data, and modify subscriptions.

#### Exposure Surface

Amplify environment variables stored in plaintext are visible to:
- Any IAM principal with `amplify:GetBranch` or `amplify:GetApp` permissions
- The Amplify Console in the AWS Management Console (visible to any console user in the account)
- All build processes and runtime code via `process.env`
- CloudTrail API logs when retrieved via API calls

#### Why This Exists

The `E2E_STRIPE_TEST_KEY` variable was added to Amplify env vars to support E2E test execution. However, the CI/CD pipeline (`.github/workflows/cicd.yml`, line 168) correctly sources this from GitHub Actions Secrets:

```yaml
- name: Run E2E tests against staging
  env:
    E2E_STRIPE_TEST_KEY: ${{ secrets.STRIPE_TEST_SECRET_KEY }}
```

The Amplify env var is **redundant** — E2E tests run in GitHub Actions, not during Amplify builds. The Amplify build spec (`amplify.yml`) does not reference `E2E_STRIPE_TEST_KEY`.

#### Practical Impact

While this is a test-mode key (not production), the risk is not zero:
- Test-mode keys can create real webhook events that trigger our handlers
- Test-mode keys expose test customer data (emails, payment methods)
- Storing any secret in plaintext normalizes bad practice, increasing the risk of a production key being added the same way

#### Remediation

**Remove `E2E_STRIPE_TEST_KEY` from Amplify environment variables** at both app and branch level. The CI/CD pipeline will continue to work because it sources the key from GitHub Actions Secrets.

The `update-amplify-env.sh` script does not support key removal (it only adds/updates). Removal requires rebuilding the env var set without the key and applying it as a full replacement. The recommended approach:

```bash
# 1. Backup current state
./plg-website/scripts/backup-amplify-env.sh development

# 2. Remove E2E_STRIPE_TEST_KEY from the backup JSON
# 3. Apply the cleaned JSON as a full replacement
```

Or use direct AWS CLI to reconstruct the environment without the key.

#### Status: ✅ REMEDIATED (2026-02-15)

`E2E_STRIPE_TEST_KEY` was removed from both Amplify app-level and branch-level environment variables. Amplify now has 17 environment variables (was 18). Backups saved to `plg-website/scripts/backups/amplify-env-development-20260215_115424.json` and `C:/tmp/amplify_{app,branch}_env_BACKUP_*.json`.

Verification:
- `aws amplify get-app` → 17 keys, no `E2E_STRIPE_TEST_KEY`
- `aws amplify get-branch` → 17 keys, no `E2E_STRIPE_TEST_KEY`
- SSM Parameter Store: 5 params (unchanged)
- Secrets Manager: 4 active secrets (unchanged at time of this fix)

---

### 4.2 FINDING-2: Legacy Mega-Secret `plg/staging/env`

**Severity:** LOW (housekeeping)
**CWE:** CWE-1078 — Inappropriate Source Code Style or Formatting (closest applicable)
**Affected Resource:** Secrets Manager secret `plg/staging/env`

#### Description

A Secrets Manager secret named `plg/staging/env` contains 25 key-value pairs spanning secrets, configuration, and public values. No code in the codebase references this path. It appears to be a legacy artifact from an earlier architecture where all environment variables were bundled into a single secret.

#### Contents (Keys Only)

Secrets (should be in Secrets Manager or SSM):
- `AUTH0_SECRET`, `AUTH0_CLIENT_SECRET` — **Legacy Auth0 secrets (Auth0 has been migrated to Cognito)**
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — Duplicates of `plg/staging/stripe`
- `KEYGEN_PRODUCT_TOKEN` — Duplicate of `plg/staging/keygen`

Configuration (should be in Amplify env vars or SSM):
- `AUTH0_BASE_URL`, `NEXT_PUBLIC_AUTH0_DOMAIN`, `NEXT_PUBLIC_AUTH0_CLIENT_ID`, `NEXT_PUBLIC_AUTH0_AUDIENCE` — **Legacy Auth0 config (no longer used)**
- `STRIPE_WEBHOOK_ENDPOINT_ID`, `NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL_URL`
- `KEYGEN_ACCOUNT_ID`, `KEYGEN_POLICY_ID_*`, `KEYGEN_WEBHOOK_PUBLIC_KEY`, `KEYGEN_WEBHOOK_ENDPOINT_ID`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_STRIPE_PRICE_*` (4 price IDs)
- `NEXT_PUBLIC_APP_URL`, `AWS_REGION`, `DYNAMODB_TABLE_NAME`, `SES_FROM_EMAIL`

#### Risks

1. **Stale values** — If someone debugs by reading this secret, they may get outdated values that differ from the actual sources (SSM, Secrets Manager, Amplify env vars)
2. **Auth0 secrets** — Contains `AUTH0_SECRET` and `AUTH0_CLIENT_SECRET` for a provider that has been migrated away. These credentials should be rotated/revoked, not left in storage
3. **Unnecessary cost** — Secrets Manager charges per secret per month and per API call

#### Remediation

Delete the secret after confirming no code, script, or automation references it:

```bash
aws secretsmanager delete-secret \
  --secret-id "plg/staging/env" \
  --recovery-window-in-days 30
```

The 30-day recovery window allows restoration if we discover an unexpected dependency.

#### Status: ✅ REMEDIATED (2026-02-15)

Deleted via `aws secretsmanager delete-secret --recovery-window-in-days 30`.
- **ARN:** `arn:aws:secretsmanager:us-east-1:496998973008:secret:plg/staging/env-XWESvA`
- **Deletion date:** 2026-03-17 (recoverable until then)
- **Secrets Manager post-deletion:** 3 active secrets (`plg/staging/stripe`, `plg/staging/keygen`, `plg/staging/app`)

If no unexpected dependencies surface during smoke testing and CI/CD validation, the secret can be left to expire. If needed, `aws secretsmanager restore-secret --secret-id plg/staging/env` restores it.

---

### 4.3 FINDING-3: Dual Storage Creates Sync Risk

**Severity:** MEDIUM (architectural)
**Affected Resources:** SSM Parameter Store + Secrets Manager for the same secrets

#### Description

Three secrets exist in **both** SSM Parameter Store and Secrets Manager:

| Secret | SSM Path | SM Path |
|--------|----------|---------|
| `STRIPE_SECRET_KEY` | `/plg/secrets/.../STRIPE_SECRET_KEY` | `plg/staging/stripe` |
| `STRIPE_WEBHOOK_SECRET` | `/plg/secrets/.../STRIPE_WEBHOOK_SECRET` | `plg/staging/stripe` |
| `KEYGEN_PRODUCT_TOKEN` | `/plg/secrets/.../KEYGEN_PRODUCT_TOKEN` | `plg/staging/keygen` |

The code in `secrets.js` originally implemented a priority chain: SSM first, then Secrets Manager fallback, while `getAppSecrets()` (for `TRIAL_TOKEN_SECRET` and `TEST_ADMIN_KEY`) went directly to Secrets Manager with no SSM equivalent. This has been inverted — see Remediation below.

#### Resolution Chain in `secrets.js` (Before)

```
getStripeSecrets():   SSM → SM → process.env (emergency fallback)
getKeygenSecrets():   SSM → SM → process.env (emergency fallback)
getAppSecrets():      SM → throw Error
```

#### Resolution Chain in `secrets.js` (After — REMEDIATED)

```
getStripeSecrets():
  1. Non-production (NODE_ENV !== "production")? → process.env
  2. Secrets Manager plg/{env}/stripe → if found, return (CANONICAL)
  3. SSM /plg/secrets/{appId}/STRIPE_SECRET_KEY → if found, return (LEGACY FALLBACK)
  4. throw new Error("Stripe secrets unavailable")

getKeygenSecrets():
  1. Non-production? → process.env
  2. Secrets Manager plg/{env}/keygen → if found, return (CANONICAL)
  3. SSM /plg/secrets/{appId}/KEYGEN_PRODUCT_TOKEN → if found, return (LEGACY FALLBACK)
  4. throw new Error("Keygen secrets unavailable")

getKeygenPolicyIds():
  1. Non-production? → process.env
  2. SSM /plg/secrets/{appId}/KEYGEN_POLICY_ID_* → if found, return
  3. throw new Error("Keygen policy IDs unavailable")

getAppSecrets():
  1. Non-production? → process.env
  2. Secrets Manager plg/{env}/app → if found, return
  3. throw new Error("App secrets unavailable")
```

#### Risks

1. **Silent inconsistency** — If a secret is rotated in SSM but not Secrets Manager (or vice versa), the system uses whichever it finds first. No validation that the two sources match
2. **Fallback masks failures** — If SSM becomes unavailable, the code silently falls to Secrets Manager. If Secrets Manager also fails, it silently falls to `process.env`. This makes outages invisible
3. **Production deployment complexity** — When deploying to production, we must populate secrets in multiple locations with matching values

#### Remediation (Pre-Production)

**Consolidate to Secrets Manager as the single canonical source:**
1. ✅ Update `getStripeSecrets()` and `getKeygenSecrets()` to use Secrets Manager as primary
2. SSM retained as legacy fallback (not deleted — provides defense-in-depth during migration)
3. Delete SSM Parameter Store entries for duplicated secrets — deferred to Phase 3
4. ✅ Replace emergency `process.env` fallback with `throw new Error()` — fail loudly

This consolidation means one place to rotate secrets (+Secrets Manager automatic rotation support), one place to audit, and an identical code path for staging and production (only the environment prefix changes: `plg/staging/*` → `plg/production/*`).

#### Status: ✅ REMEDIATED (2026-02-15)

Secrets Manager is now the canonical source for `getStripeSecrets()` and `getKeygenSecrets()`. SSM is retained as a legacy fallback (not removed yet — provides defense-in-depth). All 4 functions now use `process.env.NODE_ENV !== "production"` gate instead of `=== "development"`, ensuring CI environments (where `NODE_ENV` is `undefined`) take the safe `process.env` path.

- **Commits:** `1a6ecd6` (SM canonical + throw), `42185f3` (environment gate fix)
- **Tests:** 26 new edge case tests added to `secrets.test.js`, all 1415 tests passing
- **E2E:** Full purchase flow validated on `staging.hic-ai.com`

---

### 4.4 FINDING-4: Emergency `process.env` Fallback in Production

**Severity:** LOW (defense in depth)
**CWE:** CWE-636 — Not Failing Securely
**Affected File:** `plg-website/src/lib/secrets.js` (lines 253-259, 308-311)

#### Description

Both `getStripeSecrets()` and `getKeygenSecrets()` have a final fallback that reads from `process.env` if both SSM and Secrets Manager fail:

```javascript
// Emergency fallback to env vars (shouldn't reach here in production)
console.warn("[Secrets] All secret sources failed, falling back to process.env");
return {
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
};
```

Currently this is safe because `STRIPE_SECRET_KEY` is **not** in Amplify environment variables. However:
- If someone adds it to env vars "as a quick fix," the fallback silently activates
- The fallback returns `undefined` as secret values if env vars aren't set, causing cryptic downstream Stripe errors rather than a clear "secrets unavailable" error

In contrast, `getAppSecrets()` correctly throws an error if Secrets Manager is unavailable — this is the right pattern.

#### Remediation

Replace the emergency fallback with an explicit error throw, matching `getAppSecrets()`:

```javascript
// No silent fallback — fail loudly
console.error("CRITICAL: All secret sources failed for Stripe");
throw new Error("Stripe secrets unavailable");
```

#### Status: ✅ REMEDIATED (2026-02-15)

The emergency `process.env` fallback was replaced with `throw new Error()` in `getStripeSecrets()`, `getKeygenSecrets()`, and `getKeygenPolicyIds()`. `getAppSecrets()` already threw — no change needed there.

- **Commit:** `1a6ecd6`
- **CWE-636 resolved:** All production secret resolution paths now fail loudly instead of silently returning `undefined` values

---

## 5. What's Working Well

The audit is not all findings — several things are correctly implemented:

1. **SSM uses SecureString** — All SSM parameters use KMS encryption, not plaintext `String` type
2. **Secrets Manager is properly segmented** — Separate secrets per domain (`stripe`, `keygen`, `app`) rather than one monolithic secret
3. **Environment-aware paths** — `plg/${ENVIRONMENT}/stripe` pattern means staging and production use different secrets by construction
4. **api-log sanitizer** — The structured logging adapter sanitizes fields matching `/(authorization|bearer|password|secret|api[_-]?key|cookie|token|session)/i`, preventing accidental secret logging
5. **Presence-only logging** — The checkout route logs `hasStripeKey: Boolean(process.env.STRIPE_SECRET_KEY)` rather than the key value
6. **GitHub Actions Secrets** — CI/CD pipeline correctly uses encrypted GitHub Secrets for test keys, not hardcoded values
7. **Script tooling** — `backup-amplify-env.sh`, `update-amplify-env.sh`, and `manage-ssm-secrets.sh` provide safe, auditable secret management

---

## 6. Remediation Plan

### Phase 1: Immediate Fixes — ✅ COMPLETE (2026-02-15)

| # | Action | Risk | Reversible | Status |
|---|--------|------|:---:|:---:|
| 1a | Remove `E2E_STRIPE_TEST_KEY` from Amplify branch-level env vars | None — CI/CD uses GitHub Secrets | ✅ | ✅ Done |
| 1b | Remove `E2E_STRIPE_TEST_KEY` from Amplify app-level env vars | None — same rationale | ✅ | ✅ Done |
| 1c | Delete `plg/staging/env` from Secrets Manager (30-day recovery) | None — no code references it | ✅ | ✅ Done |

### Phase 2: Pre-Production Consolidation — ✅ CODE CHANGES COMPLETE (2026-02-15)

| # | Action | Affected Files | Risk | Status |
|---|--------|----------------|------|:---:|
| 2a | Consolidate to Secrets Manager as single source | `secrets.js` | Low — same secrets, simpler path | ✅ Done |
| 2b | Remove SSM Parameter Store entries for duplicated secrets | SSM console/CLI | Low — SSM retained as fallback | ⏳ Phase 3 |
| 2c | Replace emergency `process.env` fallback with `throw` | `secrets.js` | Low — fallback was returning `undefined` anyway | ✅ Done |
| 2d | Revoke legacy Auth0 credentials in `plg/staging/env` | Auth0 dashboard | None — Auth0 is decommissioned | ⏳ Phase 3 |
| 2e | Create `plg/production/stripe`, `plg/production/keygen`, `plg/production/app` | Secrets Manager | Required before production deploy | ⏳ Phase 3 |

**Additional fix:** Environment gate changed from `=== "development"` to `!== "production"` across all 4 functions in `secrets.js`. This ensures CI (where `NODE_ENV` is `undefined`) takes the safe `process.env` path. Commit `42185f3`.

### Phase 3: Production Deployment Readiness

| # | Action | Notes |
|---|--------|-------|
| 3a | Populate production secrets in Secrets Manager | Use `plg/production/*` paths |
| 3b | Update Amplify production env vars (non-secrets only) | Table names, URLs, Cognito config |
| 3c | Verify production compute role has Secrets Manager access for `plg/production/*` | CloudFormation parameter change |
| 3d | Run E2E validation against production | Confirm secrets resolve correctly |

---

## 7. Production Parity

The current architecture is designed so that **no code changes are needed** when switching from staging to production. The environment detection in `secrets.js` (line 33-37) handles this automatically:

```javascript
const ENVIRONMENT = process.env.NEXT_PUBLIC_APP_URL?.includes("staging")
  ? "staging"
  : process.env.NODE_ENV === "production"
    ? "production"
    : "staging";
```

This means:
- Staging resolves secrets from `plg/staging/*`
- Production resolves secrets from `plg/production/*`

As long as the production Secrets Manager entries mirror the staging structure (same key names, production values), the deployment is a configuration change, not a code change.

The Amplify environment variables follow the same principle — `NEXT_PUBLIC_APP_URL` changes from `https://staging.hic-ai.com` to `https://hic-ai.com`, which triggers the environment detection. `DYNAMODB_TABLE_NAME` changes from `hic-plg-staging` to `hic-plg-production`. No secret material needs to be in env vars for production.

---

## 8. Validation Results

All validation steps have been completed successfully across both Phase 1 and Phase 2 remediation.

### 8.1 CI/CD Pipeline Validation — ✅ PASSED

- **Phase 1 (report-only commit):** CI/CD passed, confirming `E2E_STRIPE_TEST_KEY` removal from Amplify had no impact on test execution
- **Phase 2 (commit `1a6ecd6`):** CI/CD **failed** — exposed latent environment gate bug (see §8.6)
- **Phase 2 fix (commit `42185f3`):** CI/CD **passed** — all 1415 tests green, E2E tests green, Amplify deployment successful

### 8.2 Smoke Test: Checkout Endpoint — ✅ PASSED

Full E2E purchase flow (not just smoke test) completed on `staging.hic-ai.com`:
- Test user: `vitteheffewou-6554@yopmail.com`
- Plan: Individual annual
- Stripe test card: `4242 4242 4242 4242`
- Result: Checkout → payment → license provisioning → Mouse installation → activation in Codespaces → admin portal showing 1/3 devices

### 8.3 CloudWatch Log Verification — ✅ PASSED

Structured JSON logs confirmed operational in CloudWatch log group `/aws/amplify/d2yhz9h4xdd5rb`:
- **`plg-api-checkout`:** 9 structured log entries per request with correct `correlationId`, log levels (`INFO`/`WARN`/`ERROR`), and `[REDACTED]` field sanitization
- **`plg-api-checkout-verify`:** 3 entries per request (E2E tests only — this endpoint is not called by the user-facing frontend)

### 8.4 E2E Purchase Flow — ✅ PASSED

Full manual E2E purchase flow validated (see §8.2). This exercises the complete Stripe secret resolution chain through Secrets Manager (canonical) in production mode.

### 8.5 Secrets Resolution Chain Verification — ✅ PASSED

Active secrets confirmed untouched: `plg/staging/app`, `plg/staging/keygen`, `plg/staging/stripe` (3 active). `plg/staging/env` remains in soft-delete (recoverable until 2026-03-17).

### 8.6 Environment Gate Bug (Discovered During Phase 2)

Commit `1a6ecd6` (FINDING-3/4 code changes) failed the CI/CD Code Quality Gate. Root cause: all 4 functions in `secrets.js` used `process.env.NODE_ENV === "development"` to decide when to use `process.env` vs AWS. In CI, `NODE_ENV` is `undefined`, so the gate treated CI as "production" → SSM calls failed (no AWS credentials in CI) → `getKeygenPolicyIds()` threw `"Keygen policy IDs unavailable"` → `keygen.test.js` test failure.

The old `process.env` emergency fallback (removed by FINDING-4) had been **masking** this bug — when SSM failed in CI, the code silently fell back to `process.env` and worked by accident.

**Fix:** Flipped all 4 gates from `=== "development"` to `!== "production"`. This makes production behavior opt-in (requires explicit `NODE_ENV=production`), and everything else — dev, test, CI, undefined — safely uses `process.env`. Commit `42185f3`.

---

## 9. Reference

### AWS Resources

| Resource | Value |
|----------|-------|
| Amplify App ID | `d2yhz9h4xdd5rb` |
| AWS Account | `496998973008` |
| Region | `us-east-1` |
| SSM Prefix | `/plg/secrets/d2yhz9h4xdd5rb/` |
| Secrets Manager Prefix | `plg/staging/` |

### Scripts

| Script | Purpose |
|--------|---------|
| `plg-website/scripts/backup-amplify-env.sh` | Backup Amplify env vars to timestamped JSON |
| `plg-website/scripts/update-amplify-env.sh` | Add/update Amplify env vars (both levels) |
| `plg-website/scripts/restore-amplify-env.sh` | Restore from backup |
| `plg-website/scripts/manage-ssm-secrets.sh` | Manage SSM Parameter Store secrets |

### External References

- [CWE-312: Cleartext Storage of Sensitive Information](https://cwe.mitre.org/data/definitions/312.html)
- [CWE-636: Not Failing Securely](https://cwe.mitre.org/data/definitions/636.html)
- [AWS Secrets Manager Best Practices](https://docs.aws.amazon.com/secretsmanager/latest/userguide/best-practices.html)
- [OWASP Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
