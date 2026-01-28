# Auth0 to Cognito Migration Decision

**Document Version:** 1.0.0  
**Date:** January 28, 2026  
**Author:** General Counsel  
**Status:** ✅ DECISION MADE — Proceeding with Cognito

---

## Executive Summary

After extensive debugging of Auth0 integration issues on AWS Amplify (11+ builds over 2 days), we are **abandoning Auth0** in favor of **Amazon Cognito**. The root cause is a fundamental incompatibility between Auth0's SDK v4 middleware and Amplify's SSR adapter for Next.js 16.

**Decision:** Replace Auth0 with Amazon Cognito for authentication.

**Rationale:** AWS guarantees Cognito-Amplify compatibility as it's fundamental to their business model. We cannot guarantee Auth0-Amplify compatibility as they are independent vendors with different release cycles.

**Estimated Migration Effort:** 6-8 hours

---

## Background: The Auth0/Amplify Incompatibility

### What We Tried (Jan 27-28, 2026)

Over 22 Amplify builds attempting to resolve `/auth/login` returning 404:

| Attempt | Change                                                 | Result       |
| ------- | ------------------------------------------------------ | ------------ |
| 1-5     | Migrated `/api/auth/*` → `/auth/*` (SDK v4 convention) | 404 persists |
| 6-8     | Renamed `proxy.js` → `middleware.js` (Amplify compat)  | 404 persists |
| 9-11    | Updated Auth0 Dashboard URLs to v4 convention          | 404 persists |
| 12-15   | Added cache-busting, verified env vars                 | 404 persists |
| 16-22   | Various middleware matcher configs                     | 404 persists |

### Root Cause Analysis

The issue is a **version mismatch between three moving targets**:

1. **Next.js 16** prefers `proxy.js` (new convention), supports `middleware.js` (deprecated)
2. **Auth0 SDK v4** documents `proxy.js` but shows deprecation warning for `middleware.js`
3. **Amplify SSR adapter** only recognizes `middleware.js` (53 GitHub issues mention middleware, 0 mention proxy.js)

**Result:** Auth0's middleware is detected at build time (`ƒ Proxy (Middleware)` in logs) but the `/auth/*` routes are being statically prerendered as 404 pages during build, bypassing middleware at runtime.

This is evidenced by the response headers:

```
HTTP/2 404
x-nextjs-cache: HIT
x-nextjs-prerender: 1
```

The `x-nextjs-prerender: 1` header indicates Next.js generated a static 404 page, meaning middleware never ran.

### Why This Is Unfixable (Without Vendor Changes)

- **Auth0** is primarily developed/tested against **Vercel**, not Amplify
- **Amplify** is catching up to Next.js 16 but hasn't adopted `proxy.js` convention
- **Next.js 16** introduced `proxy.js` as the new standard, deprecating `middleware.js`

We are at the intersection of three independent release cycles. Any "fix" would be brittle and could break with the next update from any vendor.

---

## Options Evaluated

### Option 1: Keep Auth0, Move to Vercel ❌

**Pros:** Auth0 SDK is designed for Vercel; guaranteed compatibility  
**Cons:** Vercel pricing is opaque and expensive for the "convenience" of wrapping AWS

**Verdict:** Rejected due to cost concerns and desire to stay in AWS ecosystem.

### Option 2: Keep Auth0, Build Custom S3/ALB/ECS Stack ❌

**Pros:** Full control, Auth0 works on standard Node.js  
**Cons:** Significant DevOps overhead (VPCs, load balancers, ECS tasks)

**Verdict:** Rejected due to operational complexity.

### Option 3: Keep Debugging Auth0 + Amplify ❌

**Pros:** No migration work  
**Cons:** Fundamentally brittle; dependent on three vendors coordinating

**Verdict:** Rejected. The integration is broken at a fundamental level.

### Option 4: Amplify + Cognito ✅ SELECTED

**Pros:**

- AWS-native, bulletproof integration (same vendor)
- Amplify Auth library is literally designed for Cognito
- 50,000 MAU free tier (vs Auth0's 7,500)
- No middleware gymnastics required
- Boring and works

**Cons:**

- Hosted UI is less polished than Auth0's Universal Login
- GitHub social login requires OIDC setup (~30 min vs 2 min)
- No built-in SCIM support (required for Enterprise SSO provisioning)

**Verdict:** Selected. The cons are solvable; the Auth0/Amplify incompatibility is not.

---

## Cognito vs Auth0: Feature Comparison

### Pricing

|                     | Cognito              | Auth0           |
| ------------------- | -------------------- | --------------- |
| **Free tier**       | **50,000 MAUs**      | 7,500 MAUs      |
| **Paid tier**       | $0.0055/MAU          | ~$0.07/MAU      |
| **SAML federation** | $0.015/MAU (50 free) | Enterprise plan |

**Winner:** Cognito (7x more free MAUs, 12x cheaper per MAU)

### Our Requirements

| Requirement                    | Cognito           | Auth0            | Notes                    |
| ------------------------------ | ----------------- | ---------------- | ------------------------ |
| Google/Gmail login             | ✅ Native         | ✅ Native        | Tie                      |
| GitHub login                   | ⚠️ OIDC setup     | ✅ Native        | 30 min extra work        |
| Auth Code + PKCE               | ✅                | ✅               | Standard OAuth 2.0       |
| Roles (owner/admin/user)       | ✅ Cognito Groups | ✅ Organizations | Groups require glue code |
| Custom branding                | ⚠️ Limited        | ✅ Full CSS      | Can build custom UI      |
| SAML (Enterprise SSO)          | ✅                | ✅               | Both work                |
| SCIM (Enterprise provisioning) | ❌                | ✅               | Build ourselves or wait  |
| **Amplify integration**        | ✅ Native         | ❌ Broken        | **The deciding factor**  |

### Enterprise SCIM Gap

SCIM is the only significant feature gap. However:

1. Enterprise customers with SCIM requirements are 12+ months away
2. We can build a SCIM 2.0 endpoint ourselves when needed
3. We can always migrate back to Auth0 (on Vercel) if SCIM becomes critical

---

## Migration Plan

### Phase 1: Create Cognito Resources (~1 hour)

#### 1.1 User Pool Configuration

```yaml
UserPool:
  Name: hic-plg-users
  UsernameAttributes: [email]
  AutoVerifiedAttributes: [email]
  PasswordPolicy:
    MinimumLength: 8
    RequireUppercase: true
    RequireLowercase: true
    RequireNumbers: true
    RequireSymbols: false
  Schema:
    - Name: account_type
      AttributeDataType: String
      Mutable: true
    - Name: org_id
      AttributeDataType: String
      Mutable: true
    - Name: org_role
      AttributeDataType: String
      Mutable: true
    - Name: stripe_customer_id
      AttributeDataType: String
      Mutable: true
```

#### 1.2 User Pool Client

```yaml
UserPoolClient:
  Name: mouse-web-client
  GenerateSecret: false # Public client for browser
  AllowedOAuthFlows: [code]
  AllowedOAuthScopes: [email, openid, profile]
  CallbackURLs:
    - http://localhost:3000/auth/callback
    - https://staging.hic-ai.com/auth/callback
    - https://hic-ai.com/auth/callback
  LogoutURLs:
    - http://localhost:3000
    - https://staging.hic-ai.com
    - https://hic-ai.com
  SupportedIdentityProviders: [COGNITO, Google, GitHub]
```

#### 1.3 Identity Providers

- **Google:** Native Cognito integration (OAuth 2.0)
- **GitHub:** OIDC provider configuration:
  ```yaml
  OIDCProvider:
    Name: GitHub
    ClientId: <github-oauth-app-client-id>
    ClientSecret: <github-oauth-app-client-secret>
    AttributeMapping:
      email: email
      username: sub
    AuthorizeUrl: https://github.com/login/oauth/authorize
    TokenUrl: https://github.com/login/oauth/access_token
    UserInfoUrl: https://api.github.com/user
  ```

#### 1.4 Cognito Groups (for Business Roles)

```
org_<org_id>_owner   → Full control
org_<org_id>_admin   → Manage team, view billing
org_<org_id>_member  → View only
```

### Phase 2: Code Changes (~4-5 hours)

| File                            | Change                                                 |
| ------------------------------- | ------------------------------------------------------ |
| `package.json`                  | Remove `@auth0/nextjs-auth0`, add `aws-amplify`        |
| `src/lib/auth0.js`              | **DELETE** — replaced by `src/lib/cognito.js`          |
| `src/lib/auth.js`               | Rewrite for Amplify Auth                               |
| `src/middleware.js`             | Simplify — remove Auth0 middleware, use redirect logic |
| `src/lib/constants.js`          | Update claim namespace                                 |
| `src/lib/dynamodb.js`           | Rename `auth0Id` → `userId` (cosmetic)                 |
| `src/app/auth/login/page.js`    | **NEW** — login page (or redirect to hosted UI)        |
| `src/app/auth/callback/page.js` | **NEW** — OAuth callback handler                       |
| `src/app/auth/logout/route.js`  | **NEW** — logout route                                 |
| All portal pages                | Update claim namespace references                      |

### Phase 3: Environment Variables (~30 min)

**Remove:**

- `AUTH0_SECRET`
- `AUTH0_DOMAIN`
- `AUTH0_CLIENT_ID`
- `AUTH0_CLIENT_SECRET`
- `AUTH0_BASE_URL`
- `NEXT_PUBLIC_AUTH0_*`

**Add:**

- `COGNITO_USER_POOL_ID`
- `COGNITO_CLIENT_ID`
- `COGNITO_DOMAIN`
- `NEXT_PUBLIC_COGNITO_USER_POOL_ID`
- `NEXT_PUBLIC_COGNITO_CLIENT_ID`
- `NEXT_PUBLIC_COGNITO_DOMAIN`

### Phase 4: Test & Deploy (~1 hour)

1. Test locally with `npm run dev`
2. Test login flow (email/password, Google, GitHub)
3. Test protected routes (`/portal/*`)
4. Test role-based access (`/portal/billing`, `/portal/team`)
5. Deploy to staging via Amplify
6. E2E test on staging

### Phase 5: Cleanup (~30 min)

1. Delete Auth0 application in Auth0 Dashboard
2. Remove Auth0 environment variables from Amplify
3. Update documentation

---

## Custom Login UI Decision

**Options:**

1. **Cognito Hosted UI** — Quick to implement, limited customization
2. **Custom Login Page** — Full control, more work

**Recommendation:** Start with Hosted UI, build custom later if needed.

The Hosted UI supports:

- Logo upload (Mouse icon)
- Primary color customization
- Custom CSS (limited)

If the UI feels too "AWS-y", we can build a custom login page using Amplify Auth's `signIn()` API.

---

## Risk Assessment

| Risk                                   | Likelihood | Impact | Mitigation                           |
| -------------------------------------- | ---------- | ------ | ------------------------------------ |
| Cognito Hosted UI looks unprofessional | Medium     | Low    | Build custom UI (4h work)            |
| GitHub OIDC setup fails                | Low        | Medium | Fall back to email-only initially    |
| User migration needed later            | Low        | Medium | No users in Auth0 yet (staging only) |
| Enterprise SCIM required sooner        | Low        | High   | Build SCIM endpoint ourselves        |

---

## Decision Record

**Date:** January 28, 2026, 10:30 AM EST  
**Decision:** Replace Auth0 with Amazon Cognito  
**Made by:** Simon (CEO), General Counsel  
**Rationale:** Auth0/Amplify incompatibility is unfixable without vendor changes. Cognito/Amplify integration is guaranteed by AWS.

---

## References

- [Auth0 Staging Troubleshooting Memo](./20260127_AUTH0_STAGING_TROUBLESHOOTING_MEMO.md)
- [PLG Roadmap v4](./plg/PLG_ROADMAP_v4.md)
- [AWS Cognito Documentation](https://docs.aws.amazon.com/cognito/)
- [Amplify Auth Documentation](https://docs.amplify.aws/react/build-a-backend/auth/)
