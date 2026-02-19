# AP 4: Switch to Production Plan

**Date:** 2026-02-18 (v2)
**Author:** GC (with SWR)
**Status:** DRAFT — awaiting SWR review before integration with Launch Plan
**Supersedes:** `20260217_AP4_SWITCH_TO_PRODUCTION_PLAN.md`
**Scope:** All steps required to bring PLG infrastructure and website live at `https://hic-ai.com`

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architectural Context](#2-architectural-context)
3. [Prerequisites](#3-prerequisites)
4. [Full Dependency Chain](#4-full-dependency-chain)
5. [Step-by-Step Phases](#5-step-by-step-phases)
   - [P0: Naming Convention Standardization](#p0-naming-convention-standardization)
   - [P1: Create Production Cognito User Pool](#p1-create-production-cognito-user-pool)
   - [P2: Deploy Production CloudFormation Stack](#p2-deploy-production-cloudformation-stack)
   - [P3: Populate Secrets & Configuration](#p3-populate-secrets--configuration)
   - [P4: Create Amplify Production Environment](#p4-create-amplify-production-environment)
   - [P5: Verify Production Build](#p5-verify-production-build)
   - [P6: Vendor Endpoint Configuration](#p6-vendor-endpoint-configuration)
   - [P7: DNS & Domain Activation](#p7-dns--domain-activation)
   - [P8: End-to-End Verification on Production](#p8-end-to-end-verification-on-production)
   - [P9: Public Activation](#p9-public-activation)
6. [When Must hic-ai.com Go Live?](#6-when-must-hic-aicom-go-live)
7. [Production Environment Variables](#7-production-environment-variables)
8. [Open Items & Unknowns](#8-open-items--unknowns)
9. [Rollback Strategy](#9-rollback-strategy)
10. [Reference: Staging Configuration Snapshot](#10-reference-staging-configuration-snapshot)

---

## 1. Executive Summary

This document details every step required to bring the PLG website and its supporting backend infrastructure live at `https://hic-ai.com`. It replaces the original AP 4 items (4.1–4.12) in the Dependency Map with a fully ordered, dependency-aware sequence.

**Key architectural constraint:** This is an **additive deployment**, not a cutover. The staging environment (`staging.hic-ai.com`, stack `hic-plg-staging`) remains permanently intact. Production infrastructure is created alongside it. No staging resources are modified, replaced, or torn down.

**Estimated duration:** 4–8 hours of hands-on work, spread across 1–2 days (accounting for external waits: Google OAuth app review, SSL certificate issuance, DNS propagation).

---

## 2. Architectural Context

### What "switch to production" actually means

Every production resource is a **new, parallel copy** of its staging counterpart:

| Resource         | Staging                                      | Production (new)                              |
| ---------------- | -------------------------------------------- | --------------------------------------------- |
| CF stack         | `hic-plg-staging`                            | `hic-plg-production`                                |
| Cognito pool     | `mouse-staging-v2` (`us-east-1_CntYimcMm`)   | New pool via `setup-cognito.sh`               |
| DynamoDB table   | `hic-plg-staging`                            | `hic-plg-production`                                |
| Lambda functions | `plg-*-staging`                              | `plg-*-production`                                  |
| Lambda layers    | Shared (not env-specific)                    | Same layers, already in place                 |
| SES              | Account-wide production access (50K/day)     | Same — no action needed                       |
| Amplify app      | `d2yhz9h4xdd5rb`, branch `development`       | Same app (new branch) or new app              |
| Secrets Manager  | `plg/staging/*`                              | `plg/production/*`                            |
| Keygen           | Live (not sandboxed); webhooks → staging URL | Same account; add production webhook endpoint |
| Stripe           | Test mode; webhooks → staging URL            | Live mode; create live products + webhooks    |
| Website URL      | `staging.hic-ai.com`                         | `hic-ai.com`                                  |

### Why the Cognito pool is created outside CloudFormation

The staging pool (`mouse-staging-v2`) was created via `scripts/setup-cognito.sh` (AWS CLI), not CloudFormation. This was initially a speed-driven tactical choice during the Auth0-to-Cognito emergency migration (Jan 28, 2026), but the pattern is architecturally sound for Cognito specifically:

1. **Immutable schema risk:** Cognito custom attributes cannot be modified or deleted after creation. CF updates that touch schema attributes can trigger pool replacement (delete + recreate), which destroys all user data.
2. **Circular dependency:** The pool needs callback URLs that include the Amplify-provided URL, but that URL doesn't exist until after the Amplify environment is created.
3. **External dependencies:** Google OAuth IdP setup requires manual steps in Google Cloud Console that CF cannot automate.

The CF stack (`plg-cognito.yaml`) deliberately takes `UserPoolId` as an input parameter and only manages what goes **on** the pool (RBAC groups, pre-token Lambda trigger). This separation is intentional and should be preserved for production.

---

## 3. Prerequisites

The following must be complete before beginning AP 4:

| #   | Prerequisite                           | Status   | Notes                                                                       |
| --- | -------------------------------------- | -------- | --------------------------------------------------------------------------- |
| 1   | E2E testing on staging passes          | Required | AP 9 — validates business logic before replicating to production            |
| 2   | Stripe live-mode credentials           | Required | Need live payment credentials for production secrets (see AP 8 AR Phase 4) |
| 3   | Keygen account is live (not sandboxed) | ✅ Done  | Already in production mode                                                  |
| 4   | SES production sending approved        | ✅ Done  | Account-wide, 50K/day                                                       |
| 5   | `hic-ai.com` domain is controlled      | ✅ Done  | Managed in GoDaddy                                                          |
| 6   | Google Cloud OAuth project exists      | ✅ Done  | Used for staging; production needs new credentials or updated redirect URIs |
| 7   | `production.json` parameters file exists     | ✅ Done  | `plg-website/infrastructure/parameters/production.json`                           |
| 8   | Lambda layers published                | ✅ Done  | 5 shared layers already deployed                                            |
| 9   | AWS SSO credentials available          | Required | With permissions for Cognito, CF, Amplify, Secrets Manager, S3              |

---

## 4. Full Dependency Chain

```
P0: Naming convention standardization
    (infrastructure: prod → production)
         │
         ▼
P1: setup-cognito.sh production
         │
         ▼
    Pool ID + Client ID
         │
         ▼
    Update production.json (UserPoolId)
         │
         ▼
P2: ./deploy.sh production
         │
         ▼
    CF Stack Outputs:
    ├── AmplifyExecutionRoleArn
    ├── AmplifyComputeRoleArn
    ├── CognitoPostConfirmationFunctionArn
    ├── PreTokenFunctionArn
    ├── DynamoDBTableName (hic-plg-production)
    └── EmailIdentity
         │
         ▼
P3: Secrets Manager + SSM
    (Stripe live keys, Keygen tokens, app secrets)
         │
         ▼
P4: Amplify production environment
    (env vars from CF outputs + secrets + Cognito IDs)
         │
         ▼
P5: Amplify build + verify
    (accessible via Amplify-provided URL)
         │
         ▼
P6: Vendor endpoints (Stripe/Keygen webhooks → Amplify URL)
         │
         ▼
    ── Limited E2E testing via Amplify URL ──
         │
         ▼
P7: DNS: hic-ai.com → Amplify production
    (SSL cert, CNAME/ALIAS records)
         │
         ▼
    Update: NEXT_PUBLIC_APP_URL, Cognito callbacks,
    vendor webhooks → hic-ai.com
         │
         ▼
P8: Full E2E verification on hic-ai.com
         │
         ▼
P9: Enable marketplace links, analytics, go public
```

---

## 5. Step-by-Step Phases

### P0: Naming Convention Standardization

**Depends on:** Nothing — this is the prerequisite for all other phases
**Estimated time:** 1–2 hours (code changes + testing)
**Risk:** Low — renames only, no logic changes

The infrastructure layer uses `prod` as the environment identifier (e.g., `deploy.sh prod`, `prod.json`, `hic-plg-prod`), while the application layer already uses `production` (e.g., `secrets.js`, `setup-cognito.sh`). This inconsistency must be resolved before any production deployment to avoid silent configuration mismatches.

#### Changes Required

**Scripts (2 files, ~10 changes):**

- `deploy.sh`: Environment validation regex, confirmation prompt, comments (~6 changes)
- `update-lambdas.sh`: Environment validation, confirmation prompt (~4 changes)

**CloudFormation Templates (9 files, ~13 changes):**

- All 9 templates: `AllowedValues: [dev, staging, prod]` → `[dev, staging, production]`
- 4 templates with conditions: `IsProduction: !Equals [!Ref Environment, prod]` → `production`
  - `plg-main-stack.yaml`, `plg-ses.yaml`, `plg-compute.yaml`, `plg-iam.yaml`
- The condition NAME `IsProduction` and all `!If [IsProduction, ...]` references do NOT change

**Parameters (1 file rename + 3 value changes):**

- Rename `prod.json` → `production.json`
- Update `Environment`: `"prod"` → `"production"`
- Update `TemplatesBucket`: `"hic-plg-templates-prod"` → `"hic-plg-templates-production"`
- Update `LambdaCodeBucket`: `"hic-plg-lambda-prod"` → `"hic-plg-lambda-production"`

**Bug Fix — `plg-iam.yaml` SES FromAddress interpolation:**

4 SES `FromAddress` policy conditions use `${Environment}.hic-ai.com` without `IsProduction` guards:

- Line 99: `ses:FromAddress: !Sub "noreply@${Environment}.hic-ai.com"` (StringEquals)
- Line 187: Same pattern (StringEquals)
- Line 296: `ses:FromAddress: !Sub "*@${Environment}.hic-ai.com"` (StringLike)
- Line 419: Same pattern (StringLike)

With `Environment=production`, these produce `noreply@production.hic-ai.com` — incorrect. Must be wrapped in `!If [IsProduction, ...]` conditions matching the pattern in `plg-main-stack.yaml` (lines 190–197).

**Already correct (no changes needed):** `secrets.js`, `setup-cognito.sh`, `amplify.yml`, all application code in `src/`

#### P0 Verification

- [ ] `deploy.sh production` runs without validation errors
- [ ] `update-lambdas.sh` accepts `production` as environment
- [ ] All 9 CF templates accept `production` in `AllowedValues`
- [ ] `IsProduction` condition evaluates to `true` with `Environment=production`
- [ ] `production.json` exists with correct values
- [ ] `plg-iam.yaml` SES FromAddress conditions use `IsProduction` guards
- [ ] `prod.json` deleted or git-moved to `production.json`

---

### P1: Create Production Cognito User Pool

**Depends on:** Prerequisites 6 and 9
**Estimated time:** 30–45 minutes (including Google OAuth setup)
**Risk:** Low — creates new resources, touches nothing existing

#### Steps

**1.1** Update `scripts/setup-cognito.sh` to accept environment as a parameter (currently hardcoded to `staging`):

```bash
ENVIRONMENT="${1:-staging}"  # Accept as CLI argument
```

Or simply edit the `ENVIRONMENT` variable to `"production"` before running.

**1.2** Run the script:

```bash
cd plg-website
ENVIRONMENT=production ./scripts/setup-cognito.sh
```

This creates:

- User pool: `mouse-plg-production` (or chosen name)
- Cognito domain: `mouse-production.auth.us-east-1.amazoncognito.com`
- App client: `mouse-plg-production-client` (public PKCE, no secret)
- Callback URLs: `https://hic-ai.com/auth/callback`, `http://localhost:3000/auth/callback`

**1.3** Add temporary callback URL for pre-DNS testing:

After pool creation, temporarily add the Amplify-provided URL (e.g., `https://main.d2yhz9h4xdd5rb.amplifyapp.com/auth/callback`) as an additional callback URL on the app client. This enables auth testing in P5–P6 before DNS cutover. Remove it after P7.

> **VS Code extension:** Auth is entirely browser-based with JWT — the extension does NOT require a `vscode://` callback URI. The `vscode://hic-ai.mouse/callback` entry in the staging pool is orphaned and should be removed during staging cleanup.

**1.4** Configure Google OAuth for the new Cognito domain:

In Google Cloud Console → APIs & Credentials → OAuth 2.0 Client:

- Add authorized JavaScript origin: `https://mouse-production.auth.us-east-1.amazoncognito.com`
- Add authorized redirect URI: `https://mouse-production.auth.us-east-1.amazoncognito.com/oauth2/idpresponse`

Then configure the Google IdP on the new pool:

```bash
GOOGLE_CLIENT_ID=<id> GOOGLE_CLIENT_SECRET=<secret> \
COGNITO_USER_POOL_ID=<NEW_POOL_ID> \
COGNITO_CLIENT_ID=<NEW_CLIENT_ID> \
./scripts/setup-social-idp.sh
```

> **Note:** `setup-social-idp.sh` currently has v1 pool defaults hardcoded. Override them via environment variables as shown, or update the script defaults.

**1.5** Record the outputs:

| Value          | Example                                             | Used In                       |
| -------------- | --------------------------------------------------- | ----------------------------- |
| User Pool ID   | `us-east-1_XXXXXXXXX`                               | `production.json`, Amplify env vars |
| Client ID      | `xxxxxxxxxxxxxxxxxxxxxxxxxx`                        | Amplify env vars              |
| Cognito Domain | `mouse-production.auth.us-east-1.amazoncognito.com` | Amplify env vars              |

**1.6** Update `plg-website/infrastructure/parameters/production.json` — add the `UserPoolId` entry:

```json
{
  "ParameterKey": "UserPoolId",
  "ParameterValue": "<NEW_POOL_ID>"
}
```

> **Current state of production.json:** The file exists and is correctly parameterized but does NOT yet include a `UserPoolId` entry (staging.json has one; production.json does not). This MUST be added before P2.

#### P1 Verification

- [ ] New pool appears in Cognito Console
- [ ] App client has correct callback URLs (`https://hic-ai.com/auth/callback`, `http://localhost:3000/auth/callback`)
- [ ] Google SSO IdP is configured on the pool
- [ ] Hosted UI loads at `https://<domain>/login?...`
- [ ] `production.json` updated with `UserPoolId`

---

### P2: Deploy Production CloudFormation Stack

**Depends on:** P1 complete (`production.json` has correct `UserPoolId`)
**Estimated time:** 15–30 minutes (5–15 min for CF stack creation)
**Risk:** Low — creates entirely new stack `hic-plg-production`, no effect on staging

#### Steps

**2.1** Preview the deployment (dry run):

```bash
cd plg-website/infrastructure
./deploy.sh production --dry-run
```

This will:

- Validate all 9 CF templates
- Create S3 buckets (`hic-plg-templates-production`, `hic-plg-lambda-production`)
- Upload templates to S3
- Retrieve shared Lambda layer ARNs (5 layers)
- Verify/build Lambda packages (6 functions)
- Create a change set and display proposed changes
- **Exit without executing** (dry run)

Review the proposed changes carefully.

**2.2** Execute the deployment:

```bash
./deploy.sh production
```

The script will prompt for confirmation:

```
Type 'yes' to confirm production deployment:
```

This creates the nested stack `hic-plg-production` with 8 child stacks:

1. DynamoDB → table `hic-plg-production`
2. Messaging → SNS topics + SQS queues
3. IAM → `plg-amplify-compute-role-production`, execution role
4. Compute → 6 Lambda functions (`plg-*-production`)
5. SES → email identity for `hic-ai.com` (already verified — same domain as staging)
6. Scheduled → EventBridge rules
7. Cognito → RBAC groups + pre-token Lambda trigger on the new pool
8. Monitoring → CloudWatch dashboard, alarms → `alerts@hic-ai.com`

**2.3** Record the stack outputs:

```bash
aws cloudformation describe-stacks \
  --stack-name hic-plg-production \
  --region us-east-1 \
  --query 'Stacks[0].Outputs[*].{Key:OutputKey,Value:OutputValue}' \
  --output table
```

Key outputs needed for P4:

| Output Key                           | Used For                       |
| ------------------------------------ | ------------------------------ |
| `AmplifyExecutionRoleArn`            | Amplify service role           |
| `AmplifyComputeRoleArn`              | Amplify SSR compute role       |
| `DynamoDBTableName`                  | `DYNAMODB_TABLE_NAME` env var  |
| `CognitoPostConfirmationFunctionArn` | Amplify auth trigger config    |
| `PreTokenFunctionArn`                | Already attached to pool by CF |

#### P2 Verification

- [ ] Stack status: `CREATE_COMPLETE`
- [ ] All 8 nested stacks succeeded
- [ ] DynamoDB table `hic-plg-production` exists
- [ ] 6 Lambda functions created with `-production` suffix
- [ ] Cognito groups (`mouse-owner`, `mouse-admin`, `mouse-member`) exist on production pool
- [ ] Pre-token Lambda trigger is attached to production pool
- [ ] CloudWatch dashboard accessible

---

### P3: Populate Secrets & Configuration

**Depends on:** P2 complete (need CF outputs); Stripe live-mode credentials available
**Estimated time:** 15–30 minutes
**Risk:** Low — creates new secret paths, does not modify staging secrets

#### Steps

**3.1** Create production secrets in AWS Secrets Manager:

Three secrets, mirroring the staging structure but with production values:

```
plg/production/stripe
├── STRIPE_SECRET_KEY         → sk_live_...
├── STRIPE_WEBHOOK_SECRET     → whsec_... (created in P6)
└── STRIPE_PUBLISHABLE_KEY    → pk_live_...

plg/production/keygen
├── KEYGEN_PRODUCT_TOKEN      → (same Keygen account, same token)
├── KEYGEN_ACCOUNT_ID         → 868fccd3-676d-4b9d-90ab-c86ae54419f6 (same)
├── KEYGEN_POLICY_ID_INDIVIDUAL → (same — identical to staging)
└── KEYGEN_POLICY_ID_BUSINESS   → (same — identical to staging)

plg/production/app
├── TRIAL_TOKEN_SECRET        → (new production secret)
└── TEST_ADMIN_KEY            → (new production secret, or omit entirely)
```

> **Note on Keygen:** Keygen is already in production mode (not sandboxed). The same account ID, policy IDs, and webhook public key are used for both staging and production — no separate policies are needed.

> **Note on Stripe:** Live-mode products and prices must be created FIRST (P6) because their IDs are needed for `NEXT_PUBLIC_STRIPE_PRICE_*` env vars. The webhook secret (`STRIPE_WEBHOOK_SECRET`) is generated when the webhook endpoint is created in P6. See AP 8 AR Phase 4.1–4.4 for the detailed Stripe-specific steps that execute during this phase.

**3.2** Create SSM parameters for production:

Using the existing `manage-ssm-secrets.sh` script (if available) or directly:

```bash
# SSM paths follow: /plg/secrets/<amplify-app-id>/<key>
# The app ID will be either the same app (new branch) or a new app ID
aws ssm put-parameter --name "/plg/secrets/<PROD_APP_ID>/STRIPE_SECRET_KEY" \
  --value "sk_live_..." --type SecureString --region us-east-1
# ... repeat for each secret
```

> **Decision needed:** Will production be a new branch on the existing Amplify app (`d2yhz9h4xdd5rb`) or an entirely new Amplify app? This affects the SSM path structure. See P4.

**3.3** Verify secrets exist:

```bash
aws secretsmanager list-secrets --region us-east-1 \
  --filters Key=name,Values=plg/production \
  --query 'SecretList[*].Name' --output table
```

#### P3 Verification

- [ ] All three Secrets Manager entries created (`plg/production/stripe`, `keygen`, `app`)
- [ ] SSM parameters created under production app ID path
- [ ] Secrets values verified (can decrypt and read)

---

### P4: Create Amplify Production Environment

**Depends on:** P2 (CF stack outputs for IAM roles), P3 (secrets populated), P1 (Cognito IDs)
**Estimated time:** 30–60 minutes
**Risk:** Medium — Amplify configuration is complex with 17+ env vars

#### Decision: Same App, New Branch ✅

> **Resolved (D-1, 2026-02-17):** Use the same existing Amplify app (`d2yhz9h4xdd5rb`), connected to the `main` branch, for the production environment. No meaningful isolation benefit from a new app given full env-var separation at the branch level. Shared build settings and existing `amplify.yml` apply. See `20260217_DECISION_AND_GAP_ANALYSIS_UPDATE.md` (D-1) for the full trade-off analysis.

#### Steps

**4.1** Create the production branch:

1. Amplify Console → App `d2yhz9h4xdd5rb` → Hosting → Branches → Connect branch
2. Connect the `main` branch
3. Amplify builds from this branch serve the production environment

**4.2** Configure IAM roles (from P2 outputs):

In Amplify Console → App settings → General:

- Service role: `AmplifyExecutionRoleArn` from P2
- Compute role (SSR): `AmplifyComputeRoleArn` from P2

**4.3** Set environment variables:

Use the `update-amplify-env.sh` script after determining the production branch/app:

```bash
./scripts/update-amplify-env.sh \
  AMPLIFY_MONOREPO_APP_ROOT=plg-website \
  DYNAMODB_REGION=us-east-1 \
  DYNAMODB_TABLE_NAME=hic-plg-production \
  KEYGEN_ACCOUNT_ID=868fccd3-676d-4b9d-90ab-c86ae54419f6 \
  KEYGEN_POLICY_ID_INDIVIDUAL=91f1947e-... \
  KEYGEN_POLICY_ID_BUSINESS=b0bcab98-... \
  KEYGEN_WEBHOOK_PUBLIC_KEY=MCowBQ... \
  NEXT_PUBLIC_APP_URL=https://hic-ai.com \
  NEXT_PUBLIC_COGNITO_USER_POOL_ID=<from-P1> \
  NEXT_PUBLIC_COGNITO_CLIENT_ID=<from-P1> \
  NEXT_PUBLIC_COGNITO_DOMAIN=<from-P1> \
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_<...> \
  NEXT_PUBLIC_STRIPE_PRICE_INDIVIDUAL_MONTHLY=<live-price-id> \
  NEXT_PUBLIC_STRIPE_PRICE_INDIVIDUAL_ANNUAL=<live-price-id> \
  NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_MONTHLY=<live-price-id> \
  NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_ANNUAL=<live-price-id> \
  SES_FROM_EMAIL=noreply@hic-ai.com
```

> **CRITICAL:** The `NEXT_PUBLIC_APP_URL` is set to `https://hic-ai.com` from the start, even before DNS is pointed. This is correct because:
>
> - It determines the OAuth redirect URLs baked into the build
> - It determines Stripe checkout success/cancel URLs
> - The build will succeed regardless — it's just a string at build time
> - Auth flows won't work until DNS is actually pointed (P7), but the build artifact will be correct when they do
>
> If pre-DNS testing is needed via the Amplify URL, a temporary re-build with `NEXT_PUBLIC_APP_URL` set to the Amplify URL is possible but adds complexity. See [Section 6](#6-when-must-hic-aicom-go-live) for analysis.

**4.4** Verify the environment variables are set:

```bash
./scripts/backup-amplify-env.sh production  # or the new branch name
```

#### P4 Verification

- [ ] Amplify environment/branch exists
- [ ] IAM roles configured (execution + compute)
- [ ] All 17 env vars set with production values
- [ ] Build settings (`amplify.yml`) correct for production

---

### P5: Verify Production Build

**Depends on:** P4 complete
**Estimated time:** 10–15 minutes (Amplify build time)
**Risk:** Low-Medium — build may fail if env vars are misconfigured

#### Steps

**5.1** Trigger a build:

Push to the connected branch, or trigger manually via Amplify Console → Redeploy.

**5.2** Monitor build logs:

Watch for:

- Next.js build completes without errors
- SSR routes compile correctly
- No missing environment variable warnings
- Amplify deployment completes

**5.3** Verify the deployed site:

Access via the Amplify-provided URL (e.g., `main.d2yhz9h4xdd5rb.amplifyapp.com`):

- Home page renders
- Pricing page renders
- Marketplace install links are still disabled (gating mechanism intact)
- No console errors related to missing env vars

> **Note:** At this point, auth flows will NOT work because `NEXT_PUBLIC_APP_URL` is `https://hic-ai.com` but the browser is on the Amplify URL. This is expected. Auth testing happens at P8 after DNS is pointed.

#### P5 Verification

- [ ] Amplify build succeeds (green checkmark)
- [ ] Site accessible at Amplify-provided URL
- [ ] Pages render correctly (no SSR errors)
- [ ] Marketplace install links remain disabled

---

### P6: Vendor Endpoint Configuration

**Depends on:** P5 (production site exists and builds); live payment credentials available
**Estimated time:** 30–60 minutes
**Risk:** Medium — involves creating live payment products

This phase can overlap with or follow P5. The webhook endpoints configured here will point to `https://hic-ai.com` (which won't resolve until P7), so webhooks won't fire until DNS is live. That's fine — we configure them now so everything is ready.

#### Stripe

**6.1** Switch to live mode in Stripe Dashboard.

**6.2** Create live-mode products and prices:

Replicate the test-mode products:

- Mouse Individual Monthly
- Mouse Individual Annual
- Mouse Business Monthly
- Mouse Business Annual

Record the new `price_` IDs — these are needed for the Amplify env vars set in P4.

> **Cross-reference:** AP 8 AR Phase 4.1 provides the detailed product table (Individual Monthly $15/mo, Individual Annual $150/yr, Business Monthly $35/seat/mo, Business Annual $350/seat/yr) and tax code assignments. This section executes that plan.

> **Important:** If these IDs weren't available during P4, update the Amplify env vars now with the correct `NEXT_PUBLIC_STRIPE_PRICE_*` values and trigger a rebuild.

**6.3** Create live-mode webhook:

- Endpoint URL: `https://hic-ai.com/api/webhooks/stripe`
- Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`
- Record the webhook signing secret → update `plg/production/stripe` in Secrets Manager

**6.4** Update Stripe publishable key in Amplify env vars if not already done:

```bash
./scripts/update-amplify-env.sh NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_<...>
```

#### Keygen

**6.5** Add production webhook endpoint in Keygen Dashboard:

- URL: `https://hic-ai.com/api/webhooks/keygen`
- Events: license lifecycle events (same as staging)

> **Note:** The staging webhook endpoint (`staging.hic-ai.com/api/webhooks/keygen`) remains intact. Both endpoints can coexist — Keygen supports multiple webhook endpoints.

> **Note on SMP:** With Stripe Managed Payments (SMP) as the primary MoR path, live-mode product creation must include the correct tax code ("downloadable software, business use") so SMP can calculate and collect applicable taxes. No separate MoR vendor configuration is needed.

#### P6 Verification

- [ ] Stripe live products/prices exist with correct tax codes
- [ ] Webhook endpoints configured pointing to `hic-ai.com`
- [ ] Webhook signing secrets stored in Secrets Manager
- [ ] Amplify env vars updated with any new price IDs (rebuild triggered if changed)

---

### P7: DNS & Domain Activation

**Depends on:** P5 (site builds and renders), P6 (vendor endpoints configured)
**Estimated time:** 15–30 minutes active work + up to 24–48 hours DNS propagation (typically < 1 hour)
**Risk:** Medium — this is the point where `hic-ai.com` starts serving the production PLG site

> **This is the commitment point.** Before P7, nothing is publicly visible. After P7, `hic-ai.com` serves the production website. The site should be fully buildable and configured before proceeding.

#### Steps

**7.1** Add custom domain in Amplify Console:

Amplify Console → App → Domain management → Add domain:

- Domain: `hic-ai.com`
- Subdomain: root (`hic-ai.com`) and optionally `www.hic-ai.com`
- Branch: `main`

Amplify will provide DNS records (CNAME or ALIAS) and initiate SSL certificate creation.

**7.2** Configure DNS records in GoDaddy:

Add the records Amplify provides. Typically:

- CNAME or ALIAS record: `hic-ai.com` → Amplify distribution
- CNAME for SSL validation: `_xxxxxxxxxx.hic-ai.com` → `_yyyyyyyy.acm-validations.aws`

**7.3** Wait for SSL certificate validation:

Amplify/ACM validates the certificate via the DNS record. Usually completes in 5–30 minutes.

**7.4** Verify domain is active:

```bash
curl -I https://hic-ai.com
# Should return 200 with Amplify headers
```

**7.5** Update Cognito callback URLs to include the production domain (if the Amplify-provided URL was temporarily used):

If the production pool already has `https://hic-ai.com/auth/callback` in its callback URLs (set in P1), no action needed. Verify:

```bash
aws cognito-idp describe-user-pool-client \
  --user-pool-id <PROD_POOL_ID> \
  --client-id <PROD_CLIENT_ID> \
  --region us-east-1 \
  --query 'UserPoolClient.CallbackURLs'
```

#### P7 Verification

- [ ] `https://hic-ai.com` resolves and serves the PLG website
- [ ] SSL certificate is valid (green padlock)
- [ ] `https://www.hic-ai.com` redirects to `https://hic-ai.com` (if configured)
- [ ] Cognito callback URLs include `https://hic-ai.com/auth/callback`
- [ ] Marketplace install links are still disabled

---

### P8: End-to-End Verification on Production

**Depends on:** P7 (DNS live), P6 (vendor endpoints configured)
**Estimated time:** 2–4 hours
**Risk:** Medium — testing against live payment infrastructure

This is a condensed version of E2E testing (AP 9), targeted specifically at the production infrastructure seams. We are verifying that production configuration is correct, not re-validating business logic (which was proven on staging).

#### Test Flows

**8.1 Authentication flow:**

- [ ] Sign up with email at `hic-ai.com/auth/login` → verification email arrives → sign in succeeds
- [ ] Google SSO sign-in works via production Cognito domain
- [ ] Token refresh works (wait for access token expiry or force refresh)
- [ ] Sign out fully clears session
- [ ] Browser-based auth flow works from VS Code extension (JWT-based, no callback URI)

**8.2 Payment flow:**

- [ ] Navigate to pricing → select plan → redirects to checkout
- [ ] Complete purchase with live payment method (real card)
- [ ] Webhook fires → verify in Stripe dashboard
- [ ] License created in Keygen for the purchasing user
- [ ] DynamoDB record created in `hic-plg-production` table

> **Note:** This involves a real live payment. Use a low-cost plan and refund immediately after verification.

**8.3 License activation:**

- [ ] Install VS Code extension → authenticate via production Cognito → activate license via production Keygen
- [ ] Heartbeat confirms license is valid
- [ ] Device appears in portal device management

**8.4 Email delivery:**

- [ ] Welcome email sends (from `noreply@hic-ai.com` — note: not `noreply@staging.hic-ai.com`)
- [ ] Email arrives in inbox (not spam)
- [ ] Email links point to `hic-ai.com` (not staging)

**8.5 Webhook reliability:**

- [ ] Keygen → `hic-ai.com/api/webhooks/keygen` — verify payload received
- [ ] Stripe → `hic-ai.com/api/webhooks/stripe` — verify payload received

**8.6 Portal flows:**

- [ ] Customer portal login works
- [ ] Subscription details display correctly
- [ ] Device management displays correctly
- [ ] Billing portal (Stripe Customer Portal) accessible

#### P8 Verification

- [ ] All 6 test flow categories pass
- [ ] No errors in CloudWatch logs for production Lambdas
- [ ] Production CloudWatch dashboard shows healthy metrics
- [ ] Refund test payment

---

### P9: Public Activation

**Depends on:** P8 passes (all E2E verification complete)
**Estimated time:** 1–2 hours active work + 24–48 hours marketplace review wait
**Risk:** Low — enabling access to already-verified infrastructure

#### Steps

**9.1** Enable marketplace install links on the website:

Remove the current UI gating mechanism that disables marketplace install buttons.

**9.2** Submit to VS Code Marketplace:

Per GAP-3 in the Dependency Map — submit extension for review. Expect 24–48 hour review period.

**9.3** Submit to Open VSX:

Parallel submission to Open VSX marketplace.

**9.4** Activate Plausible analytics:

Configure Plausible for `hic-ai.com` (AP 11.4 / Step A1 in Dependency Map).

**9.5** Revert staging to allowlist-only access:

```
staging.hic-ai.com → restrict to allowlist (SWR + dev team IPs/accounts)
```

This ensures staging is no longer publicly accessible while remaining fully functional for development.

**9.6** Final verification:

- [ ] Marketplace listing is live and install link works
- [ ] Plausible tracking script active on `hic-ai.com`
- [ ] `staging.hic-ai.com` returns 403 for non-allowlisted users
- [ ] `hic-ai.com` renders correctly in search engine preview

#### P9 Verification

- [ ] Extension installable from VS Code Marketplace
- [ ] Extension installable from Open VSX
- [ ] Analytics collecting data
- [ ] Marketing and outreach can begin

---

## 6. When Must hic-ai.com Go Live?

The core question: at what point in the sequence is the live production domain **required** vs. merely **convenient**?

| Phase                  |     Requires `hic-ai.com` live?     | Why                                                                                                          |
| ---------------------- | :---------------------------------: | ------------------------------------------------------------------------------------------------------------ |
| P1 (Cognito pool)      |                 No                  | Pool is created with callback URLs pre-configured, but they don't need to resolve yet                        |
| P2 (CF stack)          |                 No                  | Infrastructure is internal                                                                                   |
| P3 (Secrets)           |                 No                  | Configuration only                                                                                           |
| P4 (Amplify env)       |                 No                  | Env vars are strings — `NEXT_PUBLIC_APP_URL=https://hic-ai.com` works at build time even before DNS resolves |
| P5 (Build)             |                 No                  | Build succeeds regardless; site renders at Amplify URL                                                       |
| P6 (Vendor endpoints)  |                 No                  | Webhook URLs are configured but don't need to receive traffic yet                                            |
| **P7 (DNS)**           | **Yes — this is when it goes live** | DNS activation IS the go-live event                                                                          |
| P8 (E2E testing)       |               **Yes**               | Auth callbacks, webhook delivery, email links, and checkout return URLs all require the real domain          |
| P9 (Public activation) |                 Yes                 | Already live from P7                                                                                         |

**Conclusion:** `hic-ai.com` must go live at P7, immediately before E2E testing. P1–P6 can be completed entirely without the domain being live. The window between "domain goes live" (P7) and "site is fully verified" (P8 complete) is approximately **2–4 hours** — this is the period where the production website is live but not yet fully verified.

**Mitigation for the go-live window:**

- Marketplace install links are disabled throughout P7 and P8 — no one can install the extension
- No traffic is being directed to `hic-ai.com` — no marketing, no search indexing yet
- The site renders correctly from P5 onward — visitors would see a functional (if not fully tested) website
- The exposure is minimal: realistically only someone manually typing `hic-ai.com` would see the site

This is an acceptable risk profile. The site is cosmetically complete and non-interactive for the brief verification period.

---

## 7. Production Environment Variables

Complete inventory of required Amplify environment variables for production, with their sources:

| Variable                                      | Staging Value (reference)    | Production Value           | Source           |
| --------------------------------------------- | ---------------------------- | -------------------------- | ---------------- |
| `AMPLIFY_MONOREPO_APP_ROOT`                   | `plg-website`                | `plg-website`              | Same             |
| `DYNAMODB_REGION`                             | `us-east-1`                  | `us-east-1`                | Same             |
| `DYNAMODB_TABLE_NAME`                         | `hic-plg-staging`            | `hic-plg-production`             | P2 CF output     |
| `KEYGEN_ACCOUNT_ID`                           | `868fccd3-...`               | Same                       | Same             |
| `KEYGEN_POLICY_ID_INDIVIDUAL`                 | `91f1947e-...`               | Same                       | Same             |
| `KEYGEN_POLICY_ID_BUSINESS`                   | `b0bcab98-...`               | Same                       | Same             |
| `KEYGEN_WEBHOOK_PUBLIC_KEY`                   | `MCowBQ...`                  | Same                       | Same             |
| `NEXT_PUBLIC_APP_URL`                         | `https://staging.hic-ai.com` | `https://hic-ai.com`       | Known            |
| `NEXT_PUBLIC_COGNITO_USER_POOL_ID`            | `us-east-1_CntYimcMm`        | `us-east-1_XXXXXXXXX`      | P1 output        |
| `NEXT_PUBLIC_COGNITO_CLIENT_ID`               | `3jobildap1dobb...`          | New client ID              | P1 output        |
| `NEXT_PUBLIC_COGNITO_DOMAIN`                  | `mouse-staging-v2.auth...`   | `mouse-production.auth...` | P1 output        |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`          | `pk_test_...`                | `pk_live_...`              | Stripe dashboard |
| `NEXT_PUBLIC_STRIPE_PRICE_INDIVIDUAL_MONTHLY` | `price_1Suh...`              | New live price ID          | P6               |
| `NEXT_PUBLIC_STRIPE_PRICE_INDIVIDUAL_ANNUAL`  | `price_1Suh...`              | New live price ID          | P6               |
| `NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_MONTHLY`   | `price_1Suh...`              | New live price ID          | P6               |
| `NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_ANNUAL`    | `price_1Suh...`              | New live price ID          | P6               |
| `SES_FROM_EMAIL`                              | `noreply@staging.hic-ai.com` | `noreply@hic-ai.com`       | Known            |

**Count:** 17 variables (same as staging).

**Variables that are definitely identical:** `AMPLIFY_MONOREPO_APP_ROOT`, `DYNAMODB_REGION`.

**Variables that require new values:** All Cognito IDs (P1), all Stripe IDs (P6), `DYNAMODB_TABLE_NAME` (P2), `NEXT_PUBLIC_APP_URL`, `SES_FROM_EMAIL`.

**Variables that are identical to staging:** Keygen account ID, policy IDs, and webhook public key (confirmed: staging and production share the same Keygen account and policies).

---

## 8. Open Items & Unknowns

| #   | Item                                                                                                                 | Impact                                                                                                                                                               | When to Resolve                       |
| --- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| 1   | **Same Amplify app or new app for production?**                                                                      | Affects SSM paths (`AWS_APP_ID`), env var management, build isolation                                                                                                | Before P4                             |
| 2   | ~~**Stripe vs. LS decision finalized?**~~ **RESOLVED:** Stripe + SMP (see AP 8 AR)                                  | P6 uses Stripe live-mode with SMP; no LS migration. LS/Paddle retained as contingency only (AP 8 AR §14).                                                           | ✅ Resolved Feb 18                    |
| 3   | **Google OAuth: reuse existing client or create new?**                                                               | Existing client can work if production Cognito redirect URI is added; new client provides isolation                                                                  | Before P1                             |
| 4   | **Cognito: custom email sending (SES) vs. default?**                                                                 | Current staging uses `COGNITO_DEFAULT` email sending (limited to 50/day). Production should use SES for verification and MFA emails (higher limits, branded sender). | Before P1 or post-launch improvement  |
| 5   | **DynamoDB PITR:** Should Point-in-Time Recovery be enabled on production table?                                     | AP 10.7 in Dependency Map — not currently in CF template                                                                                                             | During or after P2                    |
| 6   | **`setup-cognito.sh` updates:** Script hardcodes `ENVIRONMENT="staging"`, uses v1 pool defaults in social IdP script | Minor friction; workaround is to edit vars before running                                                                                                            | Before P1 (nice to fix, not blocking) |

---

## 9. Rollback Strategy

Because this is an additive deployment, rollback is straightforward at every phase:

| Phase                 | Rollback Action                                             | Impact                                                     |
| --------------------- | ----------------------------------------------------------- | ---------------------------------------------------------- |
| P1 (Cognito)          | Delete the production pool                                  | No effect on staging                                       |
| P2 (CF stack)         | `aws cloudformation delete-stack --stack-name hic-plg-production` | Deletes all production AWS resources; no effect on staging |
| P3 (Secrets)          | Delete `plg/production/*` secrets                           | No effect on staging                                       |
| P4 (Amplify)          | Delete the production branch/app                            | No effect on staging                                       |
| P5 (Build)            | No rollback needed                                          | Build failure is non-destructive                           |
| P6 (Vendor endpoints) | Delete live-mode webhooks; revert Stripe to test mode       | Staging webhooks unaffected                                |
| P7 (DNS)              | Remove CNAME/ALIAS records for `hic-ai.com` in GoDaddy      | Domain stops resolving; staging unaffected                 |
| P8 (Testing)          | No rollback — issues found here trigger fixes, not rollback | —                                                          |
| P9 (Public)           | Re-disable marketplace links; un-publish from marketplaces  | Marketplace un-publishing may take time                    |

**The critical insight:** At no point does a production deployment failure affect staging. The worst case is: delete the production CF stack, delete the Cognito pool, remove DNS records, and you're back to the pre-AP4 state with zero damage.

---

## 10. Reference: Staging Configuration Snapshot

Current staging infrastructure (for reference when creating production equivalents):

**Cognito User Pool (staging):**

- Pool: `mouse-staging-v2` (`us-east-1_CntYimcMm`)
- Client: `mouse-staging-web` (`3jobildap1dobb5vfmiul47bvc`)
- Domain: `mouse-staging-v2.auth.us-east-1.amazoncognito.com`
- Created: 2026-01-28
- IdPs: COGNITO + Google
- Lambda triggers: post-confirmation + pre-token generation
- Users: 9

**Cognito Client Callback URLs (staging):**

- `http://localhost:3000/auth/callback`
- `https://feature-amplify-gen2-migration.d2yhz9h4xdd5rb.amplifyapp.com/auth/callback`
- `https://staging.hic-ai.com/auth/callback`
- `vscode://hic-ai.mouse/callback` ← **orphaned; flagged for removal** (VS Code extension uses browser-based JWT auth, not callback URIs)

**CloudFormation Stack (staging):**

- Stack: `hic-plg-staging`
- 8 nested stacks: DynamoDB, Messaging, IAM, Compute, SES, Scheduled, Cognito, Monitoring

**DynamoDB:** `hic-plg-staging`

**Lambda Functions (staging):**

- `plg-stream-processor-staging`
- `plg-email-sender-staging`
- `plg-customer-update-staging`
- `plg-scheduled-tasks-staging`
- `plg-cognito-post-confirmation-staging`
- `plg-cognito-pre-token-staging`

**Lambda Layers (shared):**

- `hic-base-layer`
- `hic-messaging-layer`
- `hic-dynamodb-layer`
- `hic-ses-layer`
- `hic-config-layer`

---

_This document is a standalone AP 4 reference. Stripe-specific steps in P3 and P6 are detailed in AP 8 AR (Phases 4.1–4.4). This document provides the overall infrastructure orchestration; AP 8 AR provides the Stripe-specific execution detail._

---

## Document History

| Date       | Author | Changes                                                          |
| ---------- | ------ | ---------------------------------------------------------------- |
| 2026-02-17 | GC     | Initial document — comprehensive production switch plan          |
| 2026-02-18 | GC     | **v2:** Removed all Stripe-vs-LS conditional language — Stripe + SMP is the confirmed payment path per AP 8 AR. Deleted LS section from P6. Resolved Open Item #2. Added AP 8 AR cross-references for Stripe-specific steps (P3 secrets, P6 products/webhooks). Resolved P4 same-app-vs-new-app decision per D-1 (same app, `main` branch). |
