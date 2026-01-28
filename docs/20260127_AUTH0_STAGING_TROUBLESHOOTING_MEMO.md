# Auth0 Staging Authentication Troubleshooting Memo

**Document Version:** 1.0  
**Date:** January 27, 2026  
**Author:** General Counsel  
**Status:** 🔴 BLOCKED — Requires Further Investigation

---

## Executive Summary

Authentication on the PLG staging environment (`staging.hic-ai.com`) is failing. Users clicking "Sign In" receive a 404 error instead of being redirected to Auth0's Universal Login page. This memo documents the troubleshooting steps taken, the nature of the errors observed, and recommended next steps.

**Key Finding:** The proxy/middleware is executing correctly for protected routes (e.g., `/portal` → redirects to `/auth/login`), but the Auth0 SDK's middleware function is not intercepting `/auth/*` routes as expected. The `/auth/login` route returns a cached 404 response.

---

## Environment Details

| Component             | Value                               |
| --------------------- | ----------------------------------- |
| **Amplify App ID**    | `d2yhz9h4xdd5rb`                    |
| **Branch**            | `development`                       |
| **Staging URL**       | `https://staging.hic-ai.com`        |
| **Auth0 Tenant**      | `dev-vby1x2u5b7c882n5.us.auth0.com` |
| **Auth0 Client ID**   | `MMdXibUAwtcM7GeI4eUJRytXqFjhLu20`  |
| **Auth0 App Name**    | "Mouse"                             |
| **Auth0 SDK Version** | `@auth0/nextjs-auth0` v4.14.0       |
| **Next.js Version**   | 16.1.4 (Turbopack)                  |
| **AWS Region**        | us-east-1                           |
| **Build Attempts**    | #10 through #20 (11 builds)         |

---

## Error Description

### Symptom

When navigating to `https://staging.hic-ai.com/auth/login`, the response is:

```
HTTP/1.1 404 Not Found
Content-Type: text/html; charset=utf-8
x-nextjs-cache: HIT
x-nextjs-prerender: 1
X-Cache: Error from cloudfront
```

### Key Observations

1. **Cached Static 404:** The `x-nextjs-cache: HIT` and `x-nextjs-prerender: 1` headers indicate Next.js is serving a pre-rendered 404 page, not a dynamic response.

2. **Proxy IS Running:** Protected routes work correctly:
   - `GET /portal` → `307 Redirect` to `/auth/login?returnTo=%2Fportal` ✅
   - This proves the proxy.js is executing and the Auth0 SDK is being imported

3. **Auth0 Middleware Not Intercepting:** The Auth0 SDK v4 middleware function (`auth0.middleware(request)`) is returning something that results in a 404 instead of redirecting to Auth0.

4. **Build Logs Warning:**
   ```
   WARNING: !Failed to set up process.env.secrets
   ```
   This suggests environment variables may not be fully available at runtime.

---

## Troubleshooting Steps Taken

### Build #10-12: Initial Investigation

| Step | Action                                  | Result                                                                  |
| ---- | --------------------------------------- | ----------------------------------------------------------------------- |
| 1    | Verified Auth0 Dashboard callback URLs  | ✅ URLs configured for `staging.hic-ai.com`                             |
| 2    | Checked initial `/api/auth/login` route | ❌ 500 error: `"m.handleLogin is not a function"`                       |
| 3    | Identified Auth0 SDK v4 incompatibility | SDK v4 doesn't expose `handleLogin/handleLogout/handleCallback`         |
| 4    | Added missing environment variables     | Added `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `APP_BASE_URL` (27 total vars) |

### Build #13-14: Code Migration

| Step | Action                                                        | Result                                   |
| ---- | ------------------------------------------------------------- | ---------------------------------------- |
| 5    | Updated route references from `/api/auth/*` to `/auth/*`      | Portal settings and invite pages updated |
| 6    | Deleted obsolete `/api/auth/[auth0]/route.js`                 | Removed v3-style route handler           |
| 7    | Restructured middleware to call `auth0.middleware(req)` first | Still 404 on `/auth/login`               |
| 8    | Removed SPA rewrite rule in `amplify.yml`                     | `customRules: []` — Still 404            |

### Build #15-16: Auth0 Initialization

| Step | Action                                                              | Result                                                |
| ---- | ------------------------------------------------------------------- | ----------------------------------------------------- |
| 9    | Changed to lazy initialization of Auth0Client                       | Ensures env vars available at runtime                 |
| 10   | Modified middleware to always return `authRes` for `/auth/*` routes | Still 404                                             |
| 11   | Checked build logs                                                  | Found deprecation warning about middleware convention |

### Build #17-20: Next.js 16 Migration

| Step | Action                                                             | Result                             |
| ---- | ------------------------------------------------------------------ | ---------------------------------- |
| 12   | Renamed `middleware.js` → `proxy.js` per Next.js 16 convention     | Deprecation warning gone           |
| 13   | Changed exported function from `middleware()` → `proxy()`          | Build shows `ƒ Proxy (Middleware)` |
| 14   | Changed parameter from `NextRequest` to standard `Request`         | Per Auth0 SDK docs for Next.js 16  |
| 15   | Changed from dynamic import to static import of auth0 client       | Matches Auth0 quickstart exactly   |
| 16   | Export `auth0` directly instead of via `getAuth0Client()` function | Still 404                          |

---

## Technical Analysis

### What's Working

1. **Proxy Execution:** The proxy runs and correctly redirects `/portal` to `/auth/login`
2. **Auth0 SDK Import:** No errors importing `@auth0/nextjs-auth0/server`
3. **Session Check:** `auth0.getSession()` returns `null` for unauthenticated users
4. **Build Process:** All 20 builds succeeded with no compilation errors

### What's NOT Working

1. **Auth0 Route Handling:** `auth0.middleware(request)` does not return a redirect for `/auth/login`
2. **Route Registration:** The `/auth/*` routes are not being registered/mounted by the SDK

### Hypotheses

| #   | Hypothesis                                                              | Evidence For                              | Evidence Against                       |
| --- | ----------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------- |
| 1   | AWS Amplify's Next.js SSR adapter doesn't support `proxy.js` convention | Amplify may use older adapter             | Build logs show `ƒ Proxy (Middleware)` |
| 2   | Environment variables not available at Auth0Client construction time    | Build warning about `process.env.secrets` | Static export pattern should work      |
| 3   | Auth0 SDK v4 requires specific Next.js runtime configuration            | Documentation doesn't mention this        | SDK claims Next.js 16 support          |
| 4   | CloudFront caching interferes with dynamic routes                       | `x-nextjs-cache: HIT` for 404             | Other routes (`/portal`) work          |
| 5   | Amplify's output format conflicts with Auth0 middleware                 | Amplify uses specific Lambda@Edge setup   | Need to verify adapter version         |

---

## Files Modified

### Created/Updated

| File                                          | Change                                                             |
| --------------------------------------------- | ------------------------------------------------------------------ |
| `plg-website/src/proxy.js`                    | New file (renamed from middleware.js), Next.js 16 proxy convention |
| `plg-website/src/lib/auth0.js`                | Changed to direct export of `auth0` singleton                      |
| `plg-website/amplify.yml`                     | Removed SPA rewrite rule                                           |
| `plg-website/src/app/portal/settings/page.js` | Changed logout URL to `/auth/logout`                               |
| `plg-website/src/app/invite/[token]/page.js`  | Changed login URL to `/auth/login`                                 |

### Deleted

| File                                            | Reason                    |
| ----------------------------------------------- | ------------------------- |
| `plg-website/src/app/api/auth/[auth0]/route.js` | Obsolete v3 route handler |
| `plg-website/src/middleware.js`                 | Renamed to proxy.js       |

---

## Recommended Next Steps

### Immediate (When Resuming)

1. **Check Amplify SSR Adapter Version**
   - Verify which version of `@aws-amplify/adapter-nextjs` is being used
   - Check if it supports Next.js 16 and the `proxy.ts` convention

2. **Test with middleware.js Instead of proxy.js**
   - Keep both files temporarily to see if Amplify prefers the old convention
   - The SDK docs note: "You can still continue using middleware.ts for backward compatibility"

3. **Add Debug Logging**
   - Add console.log statements in proxy.js to verify code execution
   - Check CloudWatch logs for any Auth0 SDK errors

4. **Verify Auth0 SDK Route Registration**
   - Check if Auth0 SDK is actually mounting the `/auth/*` routes
   - May need to explicitly configure route paths

### Potential Workarounds

1. **Explicit Route Handlers**
   - Create explicit `/app/auth/login/route.js` that calls Auth0 SDK
   - This bypasses the middleware-based routing

2. **Downgrade to Auth0 SDK v3**
   - v3 used explicit route handlers (`/api/auth/[auth0]`)
   - More compatible with traditional Next.js routing

3. **Contact AWS Amplify Support**
   - Ask about Next.js 16 + Auth0 SDK v4 compatibility
   - Check for known issues with `proxy.ts` convention

---

## Related Documentation

- [Auth0 SDK v4 Quickstart](https://auth0.com/docs/quickstart/webapp/nextjs/interactive)
- [Next.js 16 Middleware to Proxy Migration](https://nextjs.org/docs/messages/middleware-to-proxy)
- [AWS Amplify Next.js SSR](https://docs.aws.amazon.com/amplify/latest/userguide/amplify-nextjs.html)
- [PLG Roadmap v4](./plg/PLG_ROADMAP_v4.md)
- [Security Considerations for Auth0 Integration](./plg/20260122_SECURITY_CONSIDERATIONS_FOR_AUTH0_INTEGRATION.md)

---

## Appendix: Build History

| Build | Commit                      | Result                    | Key Change                  |
| ----- | --------------------------- | ------------------------- | --------------------------- |
| #10   | Initial deployment          | ✅ Site loads, auth 500   | First staging deploy        |
| #11   | Missing env vars added      | ✅ Build passes           | Added AUTH0_DOMAIN etc      |
| #12   | 27 env vars configured      | ✅ Still 500 on login     | Full env var set            |
| #13   | Middleware restructured     | ✅ Still 500 → 404        | Call auth0.middleware first |
| #14   | SPA rewrite removed         | ✅ Still 404              | Empty customRules           |
| #15   | Lazy Auth0 init             | ✅ Still 404              | Deferred client creation    |
| #16   | Return authRes for /auth/\* | ✅ Still 404              | Explicit return             |
| #17   | middleware.js → proxy.js    | ✅ No deprecation warning | Next.js 16 convention       |
| #18   | Simplified proxy flow       | ✅ Still 404              | Removed duplicate checks    |
| #19   | Standard Request type       | ✅ Still 404              | Per SDK docs                |
| #20   | Static auth0 import         | ✅ Still 404              | Match quickstart exactly    |

---

_End of Memo_
