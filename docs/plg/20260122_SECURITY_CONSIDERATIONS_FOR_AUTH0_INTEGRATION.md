# Security Considerations for Auth0 Integration

**Document ID:** 20260122_SECURITY_CONSIDERATIONS_FOR_AUTH0_INTEGRATION  
**Date:** January 22, 2026  
**Author:** GitHub Copilot  
**Status:** Reference Guide  
**Classification:** Internal Engineering Reference

---

## 1. Executive Summary

This memo documents security architecture considerations for integrating Auth0 authentication and authorization into the HIC AI web application and associated services. The primary concerns addressed are: (1) implementing OAuth 2.1 with PKCE for secure authentication flows, (2) protecting tokens and sessions, (3) enforcing role-based access control (RBAC) for Individual and Enterprise tiers, (4) securing both frontend (Next.js) and backend (AWS API Gateway) integration points, and (5) supporting enterprise SSO while maintaining seamless user experience. This document aligns with OWASP, CWE, OAuth 2.1 Security Best Current Practice (BCP), and official Auth0 guidance.

**Key Security Principles:**

1. **Defense in depth** — Validate authentication at both frontend middleware and backend API Gateway
2. **Least privilege** — Users receive only the permissions required for their role
3. **Short-lived credentials** — Access tokens expire quickly; refresh tokens rotate on use
4. **Zero credential storage** — Auth0 handles all credential storage and verification
5. **Enterprise-grade MFA** — Required for enterprise users, strongly encouraged for individuals

---

## 2. OAuth 2.1 with PKCE

### 2.1 Why OAuth 2.1 and PKCE?

OAuth 2.1 consolidates security best practices from OAuth 2.0 extensions (RFC 6749, RFC 7636, RFC 8252, OAuth 2.0 Security BCP). The key requirements:

| OAuth 2.1 Requirement             | Implementation                          |
| --------------------------------- | --------------------------------------- |
| **PKCE required** for all clients | Auth0 SDK enables PKCE by default       |
| **No implicit grant**             | We use Authorization Code flow only     |
| **Refresh token rotation**        | Enabled in Auth0 tenant settings        |
| **Exact redirect URI matching**   | Configured in Auth0 application         |
| **No bearer tokens in URL**       | Tokens transmitted in headers/body only |

### 2.2 Authorization Code Flow with PKCE

PKCE (Proof Key for Code Exchange) prevents authorization code interception attacks, even for public clients:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     AUTHORIZATION CODE FLOW WITH PKCE                        │
└─────────────────────────────────────────────────────────────────────────────┘

    BROWSER                          YOUR SERVER                    AUTH0
       │                                  │                           │
       │  1. User clicks "Sign In"        │                           │
       │─────────────────────────────────>│                           │
       │                                  │                           │
       │  2. Generate code_verifier       │                           │
       │     (cryptographically random)   │                           │
       │     Generate code_challenge      │                           │
       │     = SHA256(code_verifier)      │                           │
       │                                  │                           │
       │  3. Redirect to Auth0 /authorize │                           │
       │     ?response_type=code          │                           │
       │     &client_id=xxx               │                           │
       │     &redirect_uri=callback       │                           │
       │     &scope=openid profile email  │                           │
       │     &code_challenge=xxx          │ ◄─── PKCE: Challenge sent │
       │     &code_challenge_method=S256  │                           │
       │─────────────────────────────────────────────────────────────>│
       │                                  │                           │
       │  4. User authenticates           │                           │
       │     (password, Google, GitHub,   │                           │
       │      SAML SSO, passwordless)     │                           │
       │<─────────────────────────────────────────────────────────────│
       │                                  │                           │
       │  5. Auth0 redirects with code    │                           │
       │     /callback?code=AUTH_CODE     │                           │
       │─────────────────────────────────>│                           │
       │                                  │                           │
       │                                  │  6. Exchange code for tokens
       │                                  │     POST /oauth/token      │
       │                                  │     code=AUTH_CODE         │
       │                                  │     code_verifier=xxx ◄─── PKCE: Verifier proves possession
       │                                  │     client_secret=xxx      │
       │                                  │────────────────────────────>
       │                                  │                           │
       │                                  │  7. Receive tokens         │
       │                                  │     {                      │
       │                                  │       access_token,        │
       │                                  │       id_token,            │
       │                                  │       refresh_token        │
       │                                  │     }                      │
       │                                  │<────────────────────────────
       │                                  │                           │
       │  8. Session cookie set           │                           │
       │     (httpOnly, Secure, SameSite) │                           │
       │<─────────────────────────────────│                           │
       │                                  │                           │
       │  9. Redirect to /portal          │                           │
       │                                  │                           │
```

### 2.3 PKCE Security Guarantees

| Attack                              | Without PKCE                                 | With PKCE                                         |
| ----------------------------------- | -------------------------------------------- | ------------------------------------------------- |
| **Authorization code interception** | Attacker can exchange stolen code for tokens | Attacker cannot prove possession of code_verifier |
| **Malicious app on same device**    | Can intercept redirect and steal code        | Code is useless without code_verifier             |
| **Man-in-the-middle on callback**   | Full token theft possible                    | Code alone grants nothing                         |

### 2.4 Implementation with Auth0 SDK

```javascript
// app/api/auth/[auth0]/route.js
import { handleAuth, handleLogin } from "@auth0/nextjs-auth0";

export const GET = handleAuth({
  login: handleLogin({
    authorizationParams: {
      // OAuth 2.1 scopes
      scope: "openid profile email",
      // Force PKCE (SDK enables by default, but explicit is better)
      response_type: "code",
    },
    returnTo: "/portal",
  }),
});
```

The `@auth0/nextjs-auth0` SDK automatically:

- Generates cryptographically secure `code_verifier` (43-128 characters)
- Computes `code_challenge` using SHA-256
- Stores `code_verifier` server-side during the flow
- Exchanges code with verifier on callback
- Never exposes tokens to the browser

---

## 3. Token Security

### 3.1 Token Types and Purposes

| Token              | Purpose                  | Storage             | Lifetime                   | Exposure              |
| ------------------ | ------------------------ | ------------------- | -------------------------- | --------------------- |
| **Access Token**   | API authorization        | Server-side session | Short (1 hour)             | Never sent to browser |
| **ID Token**       | User identity claims     | Server-side session | Short (1 hour)             | Never sent to browser |
| **Refresh Token**  | Obtain new access tokens | Server-side session | Short (24h) with rotation  | Never sent to browser |
| **Session Cookie** | Link browser to session  | Browser (httpOnly)  | Configurable (24h default) | Cannot be read by JS  |

### 3.2 Recommended Token Lifetimes

Following OWASP and Auth0 best practices:

```javascript
// Auth0 Dashboard → Applications → APIs → Token Settings

{
  "access_token_lifetime": 3600,        // 1 hour (Auth0 max for SPAs)
  "refresh_token_lifetime": 86400,      // 24 hours absolute expiry
  "refresh_token_idle_lifetime": 43200, // 12 hours idle expiry
  "refresh_token_rotation": true,       // 🔒 CRITICAL: Enable rotation
  "refresh_token_reuse_interval": 0     // No reuse window (strictest)
}
```

### 3.3 Refresh Token Rotation

Refresh token rotation is **mandatory** for security:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         REFRESH TOKEN ROTATION                               │
└─────────────────────────────────────────────────────────────────────────────┘

    Time T₀: Initial login
    ────────────────────────
    Access Token:  AT₁ (expires T₀ + 1h)
    Refresh Token: RT₁ (expires T₀ + 24h)

    Time T₁: Access token expired, refresh needed
    ────────────────────────────────────────────
    Client sends RT₁ to Auth0
    Auth0 returns:
      - New Access Token:  AT₂ (expires T₁ + 1h)
      - New Refresh Token: RT₂ (expires T₁ + 24h)  ◄─── RT₁ is now INVALIDATED

    Time T₂: Attacker tries to use stolen RT₁
    ────────────────────────────────────────────
    Auth0 rejects RT₁ (already rotated)
    Auth0 MAY invalidate RT₂ as well (replay detection)
    User forced to re-authenticate ◄─── Security recovery
```

**Why rotation matters:**

- Stolen refresh tokens have limited usefulness
- Replay detection can identify compromised tokens
- Reduces window of exposure from token theft

### 3.4 Token Storage Security

**Never store tokens in browser-accessible storage:**

| Storage Location                         | Security                 | HIC AI Usage            |
| ---------------------------------------- | ------------------------ | ----------------------- |
| **localStorage**                         | ❌ Accessible via XSS    | Never                   |
| **sessionStorage**                       | ❌ Accessible via XSS    | Never                   |
| **Cookies (non-httpOnly)**               | ❌ Accessible via XSS    | Never                   |
| **Cookies (httpOnly, Secure, SameSite)** | ✅ Not accessible via JS | Session identifier only |
| **Server-side session**                  | ✅ Isolated from browser | All tokens              |

The Auth0 SDK stores tokens server-side and uses an encrypted, httpOnly session cookie to link requests to the session.

### 3.5 Environment Variables for Auth0

```bash
# .env.local

# ═══════════════════════════════════════════════════════════════════
# 🔒 SERVER-ONLY (No NEXT_PUBLIC_ prefix)
# ═══════════════════════════════════════════════════════════════════

# Auth0 application credentials
AUTH0_SECRET='use [openssl rand -hex 32] to generate a 32-byte value'
AUTH0_CLIENT_SECRET='your-auth0-client-secret'
AUTH0_BASE_URL='https://hic-ai.com'

# 🔒 Management API (for user operations) - if needed
AUTH0_MANAGEMENT_CLIENT_ID='management-api-client-id'
AUTH0_MANAGEMENT_CLIENT_SECRET='management-api-client-secret'

# ═══════════════════════════════════════════════════════════════════
# 🌐 PUBLIC (Safe for browser)
# ═══════════════════════════════════════════════════════════════════

NEXT_PUBLIC_AUTH0_DOMAIN='dev-vby1x2u5b7c882n5.us.auth0.com'
NEXT_PUBLIC_AUTH0_CLIENT_ID='MMdXibUAwtcM7GeI4eUJRytXqFjhLu20'
NEXT_PUBLIC_AUTH0_AUDIENCE='https://api.hic-ai.com'
```

**Critical:** `AUTH0_SECRET` must be:

- At least 32 bytes (256 bits)
- Cryptographically random
- Unique per environment
- Never committed to version control

Generate with: `openssl rand -hex 32`

---

## 4. Session Management

### 4.1 Session Cookie Configuration

```javascript
// lib/auth0-config.js
export const auth0Config = {
  secret: process.env.AUTH0_SECRET,
  baseURL: process.env.AUTH0_BASE_URL,
  clientID: process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID,
  clientSecret: process.env.AUTH0_CLIENT_SECRET,
  issuerBaseURL: `https://${process.env.NEXT_PUBLIC_AUTH0_DOMAIN}`,

  session: {
    // 🔒 Session cookie settings
    cookie: {
      httpOnly: true, // Not accessible via JavaScript
      secure: true, // HTTPS only (set false for localhost)
      sameSite: "lax", // CSRF protection
      path: "/",
      transient: false, // Persistent cookie
    },

    // Session duration
    absoluteDuration: 86400, // 24 hours max session
    rollingDuration: 43200, // 12 hours - resets on activity

    // 🔒 Store tokens server-side, not in cookie
    storeAccessToken: true,
    storeRefreshToken: true,
    storeIDToken: true,
  },

  // Routes configuration
  routes: {
    callback: "/api/auth/callback",
    postLogoutRedirect: "/",
  },
};
```

### 4.2 Session Security Properties

| Property           | Setting  | Security Rationale                         |
| ------------------ | -------- | ------------------------------------------ |
| `httpOnly`         | `true`   | Prevents XSS from accessing session cookie |
| `secure`           | `true`   | Cookie only sent over HTTPS                |
| `sameSite`         | `'lax'`  | Prevents CSRF; allows top-level navigation |
| `absoluteDuration` | 24 hours | Forces re-authentication daily             |
| `rollingDuration`  | 12 hours | Idle sessions expire faster                |

### 4.3 Session Fixation Prevention

The Auth0 SDK automatically:

1. Generates new session ID after successful authentication
2. Invalidates any pre-authentication session
3. Binds session to authenticated user identity

### 4.4 Forced Logout Scenarios

```javascript
// lib/auth.js
import { getSession } from "@auth0/nextjs-auth0";

export async function validateSession() {
  const session = await getSession();

  if (!session) {
    return { valid: false, reason: "NO_SESSION" };
  }

  // Check if user account is still active
  const user = await getUserFromDatabase(session.user.sub);

  if (!user) {
    // User deleted - force logout
    return { valid: false, reason: "USER_DELETED", forceLogout: true };
  }

  if (user.status === "SUSPENDED") {
    // Account suspended - force logout
    return { valid: false, reason: "ACCOUNT_SUSPENDED", forceLogout: true };
  }

  // For enterprise users, check organization status
  if (user.organizationId) {
    const org = await getOrganization(user.organizationId);
    if (org.status === "SUSPENDED") {
      return { valid: false, reason: "ORG_SUSPENDED", forceLogout: true };
    }
  }

  return { valid: true, user, session };
}
```

### 4.5 Logout Security

```javascript
// app/api/auth/[auth0]/route.js
import { handleAuth, handleLogout } from "@auth0/nextjs-auth0";

export const GET = handleAuth({
  logout: handleLogout({
    returnTo: "/",
    // 🔒 Federated logout - also log out of Auth0 session
    // This prevents "silent re-login" if user is still authenticated at IdP
    logoutParams: {
      federated: true, // Optional: also logout from upstream IdP
    },
  }),
});
```

**Logout clears:**

1. Application session (server-side)
2. Session cookie (browser)
3. Auth0 session (optional: federated logout)
4. Upstream IdP session (optional: if federated)

---

## 5. Social Login & Enterprise SSO

### 5.1 Supported Identity Providers

| Provider                 | Type           | Use Case              | MFA Handling             |
| ------------------------ | -------------- | --------------------- | ------------------------ |
| **Username/Password**    | Database       | Default option        | Auth0 MFA policies apply |
| **Google**               | Social         | Consumer convenience  | Google's MFA applies     |
| **GitHub**               | Social         | Developer preference  | GitHub's MFA applies     |
| **SAML 2.0**             | Enterprise SSO | Per-customer IdP      | Customer IdP MFA applies |
| **Okta**                 | Enterprise SSO | Common enterprise IdP | Okta MFA applies         |
| **Azure AD**             | Enterprise SSO | Microsoft shops       | Azure AD MFA applies     |
| **Passwordless (Email)** | Passwordless   | High security option  | Inherent (OTP via email) |

### 5.2 Auth0 Organizations for Enterprise

Auth0 Organizations provide isolated authentication contexts for B2B:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AUTH0 ORGANIZATIONS                                  │
└─────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────────────────┐
    │  Auth0 Tenant: hic-ai                                               │
    │                                                                     │
    │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐     │
    │  │  Organization:  │  │  Organization:  │  │  Organization:  │     │
    │  │  acme-corp      │  │  globex-inc     │  │  initech        │     │
    │  │                 │  │                 │  │                 │     │
    │  │  SSO: Okta      │  │  SSO: Azure AD  │  │  SSO: None      │     │
    │  │  MFA: Required  │  │  MFA: Required  │  │  MFA: Required  │     │
    │  │  Domain: ✓      │  │  Domain: ✓      │  │  Domain: ✓      │     │
    │  │                 │  │                 │  │                 │     │
    │  │  Members:       │  │  Members:       │  │  Members:       │     │
    │  │  - billing@     │  │  - admin@       │  │  - owner@       │     │
    │  │  - dev1@        │  │  - dev1@        │  │  - team@        │     │
    │  │  - dev2@        │  │  - dev2@        │  │                 │     │
    │  └─────────────────┘  └─────────────────┘  └─────────────────┘     │
    │                                                                     │
    │  Individual Users (No Organization):                                │
    │  - indie-dev@gmail.com                                              │
    │  - freelancer@outlook.com                                           │
    │                                                                     │
    └─────────────────────────────────────────────────────────────────────┘
```

**Benefits:**

- Each organization can have its own SSO connection
- Organization-specific MFA policies
- Isolated member management
- Domain verification per organization
- Billing Contact / Admin / Member roles scoped to organization

### 5.3 Organization-Aware Login

```javascript
// app/api/auth/[auth0]/route.js
import { handleAuth, handleLogin } from "@auth0/nextjs-auth0";

export const GET = handleAuth({
  login: handleLogin((req) => {
    // Check if logging into a specific organization
    const orgId = req.nextUrl.searchParams.get("organization");

    return {
      authorizationParams: {
        scope: "openid profile email",
        // If org specified, restrict to that org's connections
        ...(orgId && { organization: orgId }),
      },
      returnTo: orgId ? "/admin" : "/portal",
    };
  }),
});
```

### 5.4 Enterprise SSO Security Considerations

| Consideration            | Implementation                                                  |
| ------------------------ | --------------------------------------------------------------- |
| **IdP-initiated login**  | Disabled by default (vulnerable to CSRF); use SP-initiated only |
| **Assertion signature**  | Require signed SAML assertions                                  |
| **Assertion encryption** | Enable if IdP supports                                          |
| **Name ID format**       | Use persistent or email; avoid transient                        |
| **Attribute mapping**    | Map only required attributes (email, name, groups)              |
| **Certificate rotation** | Monitor IdP certificate expiry; plan rotation                   |

### 5.5 Email Verification for Social Login

```javascript
// Auth0 Action: Post-Login - Verify Email
exports.onExecutePostLogin = async (event, api) => {
  // Social logins may not verify email
  if (!event.user.email_verified) {
    // For enterprise orgs, require verification
    if (event.organization) {
      api.access.deny(
        "Please verify your email address before accessing the organization.",
      );
      return;
    }

    // For individuals, allow but flag
    api.idToken.setCustomClaim("https://hic-ai.com/email_verified", false);
  }
};
```

### 5.6 Domain-Based Organization Routing

For enterprise customers with verified domains:

```javascript
// Auth0 Action: Post-Login - Route to Organization
exports.onExecutePostLogin = async (event, api) => {
  if (event.organization) {
    // Already in an org context
    return;
  }

  // Check if user's email domain maps to an organization
  const domain = event.user.email.split("@")[1];

  // Query Auth0 Management API for org with this domain
  const ManagementClient = require("auth0").ManagementClient;
  const management = new ManagementClient({
    domain: event.secrets.AUTH0_DOMAIN,
    clientId: event.secrets.AUTH0_MGMT_CLIENT_ID,
    clientSecret: event.secrets.AUTH0_MGMT_CLIENT_SECRET,
  });

  try {
    const orgs = await management.organizations.getAll();
    const matchingOrg = orgs.find((org) =>
      org.metadata?.verified_domains?.includes(domain),
    );

    if (matchingOrg) {
      // Redirect to org-specific login
      api.redirect.sendUserTo(
        `https://hic-ai.com/api/auth/login?organization=${matchingOrg.id}`,
      );
    }
  } catch (error) {
    console.error("Domain routing error:", error);
    // Continue without org context
  }
};
```

---

## 6. Role-Based Access Control (RBAC)

### 6.1 Role Hierarchy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              RBAC MODEL                                      │
└─────────────────────────────────────────────────────────────────────────────┘

    INDIVIDUAL TIER ($10/mo)
    ────────────────────────
    No roles - single user account with full self-service access

    ENTERPRISE TIER ($25/seat/mo)
    ─────────────────────────────
    ┌─────────────────────────────────────────────────────────────────┐
    │  org_billing (1 per organization - UNIQUE)                      │
    │  ─────────────────────────────────────────────────              │
    │  • Delete organization account                                  │
    │  • Change subscription (add/remove seats)                       │
    │  • Update payment method                                        │
    │  • View/download invoices                                       │
    │  • Assign/revoke licenses                                       │
    │  • Promote members to Admin                                     │
    │  • Demote Admins to Member                                      │
    │  • All Admin permissions                                        │
    │  • Transfer Billing Contact role (to another Admin)             │
    └─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │  org_admin (0 or more per organization)                         │
    │  ────────────────────────────────────────                       │
    │  • Assign/revoke licenses                                       │
    │  • Invite new members                                           │
    │  • Remove members (except Billing Contact)                      │
    │  • View organization usage/analytics                            │
    │  • View billing history (read-only)                             │
    │  • All Member permissions                                       │
    │  ✗ Cannot delete organization                                   │
    │  ✗ Cannot change subscription                                   │
    │  ✗ Cannot update payment method                                 │
    └─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │  org_member (1 or more per organization)                        │
    │  ─────────────────────────────────────────                      │
    │  • View own license status                                      │
    │  • Activate license on devices                                  │
    │  • View own device list                                         │
    │  • Deactivate own devices                                       │
    │  • Access Mouse features per license                            │
    │  ✗ Cannot view other members                                    │
    │  ✗ Cannot view billing                                          │
    │  ✗ Cannot manage licenses                                       │
    └─────────────────────────────────────────────────────────────────┘
```

### 6.2 JWT Custom Claims

Include role and organization information in the ID token:

```javascript
// Auth0 Action: Post-Login - Add Custom Claims
exports.onExecutePostLogin = async (event, api) => {
  const namespace = "https://hic-ai.com";

  // Add standard claims
  api.idToken.setCustomClaim(
    `${namespace}/customer_id`,
    event.user.app_metadata.customer_id,
  );
  api.idToken.setCustomClaim(
    `${namespace}/account_type`,
    event.user.app_metadata.account_type,
  );

  // Add organization claims if in org context
  if (event.organization) {
    api.idToken.setCustomClaim(`${namespace}/org_id`, event.organization.id);
    api.idToken.setCustomClaim(
      `${namespace}/org_name`,
      event.organization.name,
    );

    // Get role from organization membership
    const roles = event.authorization?.roles || [];
    api.idToken.setCustomClaim(`${namespace}/org_roles`, roles);

    // Convenience flags for frontend
    api.idToken.setCustomClaim(
      `${namespace}/is_billing`,
      roles.includes("org_billing"),
    );
    api.idToken.setCustomClaim(
      `${namespace}/is_admin`,
      roles.includes("org_admin") || roles.includes("org_billing"),
    );
  }

  // Access token claims for API authorization
  api.accessToken.setCustomClaim(
    `${namespace}/customer_id`,
    event.user.app_metadata.customer_id,
  );
  api.accessToken.setCustomClaim(
    `${namespace}/account_type`,
    event.user.app_metadata.account_type,
  );
  if (event.organization) {
    api.accessToken.setCustomClaim(
      `${namespace}/org_id`,
      event.organization.id,
    );
    api.accessToken.setCustomClaim(
      `${namespace}/org_roles`,
      event.authorization?.roles || [],
    );
  }
};
```

### 6.3 Permission Enforcement in API Routes

```javascript
// lib/auth.js
import { getSession } from "@auth0/nextjs-auth0";

const namespace = "https://hic-ai.com";

export async function requireAuth() {
  const session = await getSession();
  if (!session?.user) {
    throw new AuthError("Authentication required", 401);
  }
  return session;
}

export async function requireOrgRole(requiredRoles) {
  const session = await requireAuth();
  const roles = session.user[`${namespace}/org_roles`] || [];

  const hasRole = requiredRoles.some((role) => roles.includes(role));
  if (!hasRole) {
    throw new AuthError("Insufficient permissions", 403);
  }

  return session;
}

export async function requireBillingContact() {
  return requireOrgRole(["org_billing"]);
}

export async function requireAdmin() {
  return requireOrgRole(["org_billing", "org_admin"]);
}

export async function requireMember() {
  return requireOrgRole(["org_billing", "org_admin", "org_member"]);
}
```

### 6.4 Route Protection Examples

```javascript
// app/api/admin/billing/update-payment/route.js
import { requireBillingContact } from "@/lib/auth";

export async function POST(request) {
  // Only Billing Contact can update payment method
  const session = await requireBillingContact();

  const orgId = session.user["https://hic-ai.com/org_id"];

  // ... update payment logic
}

// app/api/admin/members/route.js
import { requireAdmin } from "@/lib/auth";

export async function GET(request) {
  // Billing Contact or Admin can view members
  const session = await requireAdmin();

  const orgId = session.user["https://hic-ai.com/org_id"];
  const members = await getOrganizationMembers(orgId);

  return Response.json({ members });
}

// app/api/admin/organization/delete/route.js
import { requireBillingContact } from "@/lib/auth";

export async function DELETE(request) {
  // ONLY Billing Contact can delete organization
  const session = await requireBillingContact();

  const orgId = session.user["https://hic-ai.com/org_id"];

  // Require confirmation
  const { confirmationPhrase } = await request.json();
  if (confirmationPhrase !== "DELETE MY ORGANIZATION") {
    return Response.json({ error: "Invalid confirmation" }, { status: 400 });
  }

  // ... deletion logic
}
```

### 6.5 Billing Contact Transfer

```javascript
// app/api/admin/billing/transfer/route.js
import { requireBillingContact } from "@/lib/auth";
import { ManagementClient } from "auth0";

export async function POST(request) {
  const session = await requireBillingContact();
  const { newBillingUserId } = await request.json();

  const orgId = session.user["https://hic-ai.com/org_id"];
  const currentUserId = session.user.sub;

  // Verify new user is an admin in this org
  const management = new ManagementClient({
    domain: process.env.AUTH0_DOMAIN,
    clientId: process.env.AUTH0_MGMT_CLIENT_ID,
    clientSecret: process.env.AUTH0_MGMT_CLIENT_SECRET,
  });

  // Get new user's roles in org
  const newUserRoles = await management.organizations.getMemberRoles({
    id: orgId,
    user_id: newBillingUserId,
  });

  if (!newUserRoles.some((r) => r.name === "org_admin")) {
    return Response.json(
      { error: "New Billing Contact must be an Admin first" },
      { status: 400 },
    );
  }

  // Transfer: Remove billing from current, add to new
  await management.organizations.deleteMemberRoles({
    id: orgId,
    user_id: currentUserId,
    roles: ["org_billing"],
  });

  await management.organizations.addMemberRoles({
    id: orgId,
    user_id: newBillingUserId,
    roles: ["org_billing"],
  });

  // Demote old billing contact to admin
  await management.organizations.addMemberRoles({
    id: orgId,
    user_id: currentUserId,
    roles: ["org_admin"],
  });

  return Response.json({ success: true });
}
```

---

## 7. Frontend Security

### 7.1 Middleware Protection

```javascript
// middleware.js
import {
  withMiddlewareAuthRequired,
  getSession,
} from "@auth0/nextjs-auth0/edge";
import { NextResponse } from "next/server";

export default withMiddlewareAuthRequired(async function middleware(req) {
  const res = NextResponse.next();
  const session = await getSession(req, res);

  // Route-specific authorization
  const path = req.nextUrl.pathname;

  // Admin routes require org context
  if (path.startsWith("/admin")) {
    const orgId = session?.user?.["https://hic-ai.com/org_id"];
    if (!orgId) {
      // Individual user trying to access admin - redirect to portal
      return NextResponse.redirect(new URL("/portal", req.url));
    }
  }

  return res;
});

export const config = {
  matcher: ["/portal/:path*", "/admin/:path*"],
};
```

### 7.2 XSS Prevention

The Auth0 SDK provides built-in XSS protection:

| Vector                   | Protection                                          |
| ------------------------ | --------------------------------------------------- |
| **Session cookie theft** | httpOnly flag prevents JavaScript access            |
| **Token theft**          | Tokens stored server-side, never exposed to browser |
| **Reflected XSS**        | Session bound to origin via SameSite cookie         |
| **DOM manipulation**     | No sensitive data in DOM; fetch from server         |

**Additional measures:**

```javascript
// next.config.js
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://*.auth0.com",
      "style-src 'self' 'unsafe-inline'",
      "frame-src 'self' https://*.auth0.com",
      "connect-src 'self' https://*.auth0.com https://api.stripe.com",
      "img-src 'self' https://*.auth0.com https://*.gravatar.com data:",
    ].join("; "),
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
];

module.exports = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
```

### 7.3 CSRF Protection

The Auth0 SDK implements CSRF protection via:

1. **State parameter** — Random value in authorization request, verified on callback
2. **SameSite cookies** — Session cookie not sent on cross-origin requests
3. **PKCE** — Authorization code bound to code_verifier

### 7.4 Secure Redirect Handling

```javascript
// lib/auth.js

const ALLOWED_RETURN_PATHS = [
  "/portal",
  "/admin",
  "/portal/licenses",
  "/portal/billing",
  "/admin/members",
  "/admin/billing",
];

export function validateReturnTo(returnTo) {
  if (!returnTo) return "/portal";

  // Must be relative path
  if (returnTo.startsWith("http://") || returnTo.startsWith("https://")) {
    console.warn("Attempted open redirect:", returnTo);
    return "/portal";
  }

  // Must be in allowed list (or prefix match)
  const isAllowed = ALLOWED_RETURN_PATHS.some(
    (path) => returnTo === path || returnTo.startsWith(path + "/"),
  );

  if (!isAllowed) {
    console.warn("Unauthorized return path:", returnTo);
    return "/portal";
  }

  return returnTo;
}
```

### 7.5 User Display in Components

```javascript
// components/UserProfile.jsx
"use client";

import { useUser } from "@auth0/nextjs-auth0/client";

export function UserProfile() {
  const { user, isLoading, error } = useUser();

  if (isLoading) return <Skeleton />;
  if (error) return <ErrorDisplay error={error} />;
  if (!user) return null;

  // Safe to display - all values are escaped by React
  return (
    <div className="user-profile">
      <img
        src={user.picture || "/default-avatar.png"}
        alt="" // Decorative
        referrerPolicy="no-referrer" // Privacy
      />
      <span>{user.name}</span>
      <span className="email">{user.email}</span>
    </div>
  );
}
```

---

## 8. Backend Security (AWS API Gateway)

### 8.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    API GATEWAY JWT AUTHORIZATION                             │
└─────────────────────────────────────────────────────────────────────────────┘

    Mouse Extension           AWS API Gateway              Lambda Functions
    (License Validation)           │                            │
           │                       │                            │
           │  GET /api/v1/license/validate                      │
           │  Authorization: Bearer <access_token>              │
           │──────────────────────>│                            │
           │                       │                            │
           │                       │  1. Extract JWT from       │
           │                       │     Authorization header   │
           │                       │                            │
           │                       │  2. Verify JWT signature   │
           │                       │     using Auth0 JWKS       │
           │                       │                            │
           │                       │  3. Validate claims:       │
           │                       │     - iss (Auth0 domain)   │
           │                       │     - aud (API identifier) │
           │                       │     - exp (not expired)    │
           │                       │                            │
           │                       │  4. Extract custom claims  │
           │                       │     for authorization      │
           │                       │                            │
           │                       │  ✅ JWT Valid              │
           │                       │─────────────────────────────>
           │                       │                            │
           │                       │                            │  5. Lambda checks:
           │                       │                            │     - customer_id
           │                       │                            │     - account_type
           │                       │                            │     - org permissions
           │                       │                            │
           │                       │  Response                  │
           │<──────────────────────│<─────────────────────────────
           │                       │                            │
```

### 8.2 API Gateway JWT Authorizer Configuration

```yaml
# AWS SAM / CloudFormation template
Resources:
  HicApiGateway:
    Type: AWS::Serverless::Api
    Properties:
      StageName: prod
      Auth:
        DefaultAuthorizer: Auth0JwtAuthorizer
        Authorizers:
          Auth0JwtAuthorizer:
            JwtConfiguration:
              issuer: !Sub "https://${Auth0Domain}/"
              audience:
                - !Ref Auth0Audience
            IdentitySource: "$request.header.Authorization"

  # Public endpoint (no auth)
  HealthCheckFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: health.handler
      Events:
        HealthCheck:
          Type: Api
          Properties:
            RestApiId: !Ref HicApiGateway
            Path: /health
            Method: GET
            Auth:
              Authorizer: NONE

  # Protected endpoint (JWT required)
  LicenseValidateFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: license.validate
      Events:
        ValidateLicense:
          Type: Api
          Properties:
            RestApiId: !Ref HicApiGateway
            Path: /api/v1/license/validate
            Method: GET
            # Uses default Auth0JwtAuthorizer
```

### 8.3 JWT Validation Checklist

API Gateway JWT authorizer validates:

| Claim       | Validation                      | Failure Response |
| ----------- | ------------------------------- | ---------------- |
| `iss`       | Must match Auth0 domain exactly | 401 Unauthorized |
| `aud`       | Must include API identifier     | 401 Unauthorized |
| `exp`       | Must not be expired             | 401 Unauthorized |
| `signature` | Must be valid per JWKS          | 401 Unauthorized |

### 8.4 Lambda Function Authorization

After JWT validation, Lambda performs additional authorization:

```javascript
// lambda/license.js

const namespace = "https://hic-ai.com";

export async function validate(event) {
  // JWT already validated by API Gateway
  // Extract claims from authorizer context
  const claims = event.requestContext.authorizer.jwt.claims;

  const customerId = claims[`${namespace}/customer_id`];
  const accountType = claims[`${namespace}/account_type`];
  const orgId = claims[`${namespace}/org_id`];
  const orgRoles = claims[`${namespace}/org_roles`] || [];

  // Validate request parameters
  const licenseKey = event.queryStringParameters?.key;
  const machineFingerprint = event.queryStringParameters?.fingerprint;

  if (!licenseKey || !machineFingerprint) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing required parameters" }),
    };
  }

  // Verify license belongs to this customer/org
  const license = await getLicenseByKey(licenseKey);

  if (!license) {
    return {
      statusCode: 404,
      body: JSON.stringify({ error: "License not found" }),
    };
  }

  // Authorization check: user must own this license
  if (license.customerId !== customerId) {
    // For enterprise, check org membership
    if (orgId && license.organizationId === orgId) {
      // Valid - license belongs to user's org
    } else {
      console.warn(
        `Authorization failed: User ${customerId} attempted to validate license ${licenseKey}`,
      );
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "Access denied" }),
      };
    }
  }

  // Validate against Keygen
  const validation = await keygenValidate(licenseKey, machineFingerprint);

  return {
    statusCode: 200,
    body: JSON.stringify({
      valid: validation.valid,
      code: validation.code,
      entitlements: validation.entitlements,
      expiry: validation.expiry,
    }),
  };
}
```

### 8.5 M2M Authentication (Scheduled Jobs)

For phone-home validation scheduled jobs (no user context):

```javascript
// lambda/scheduled-validation.js
import { ManagementClient } from "auth0";

// M2M token caching
let cachedToken = null;
let tokenExpiry = 0;

async function getM2MToken() {
  // Return cached token if still valid
  if (cachedToken && Date.now() < tokenExpiry - 60000) {
    return cachedToken;
  }

  // Request new M2M token
  const response = await fetch(
    `https://${process.env.AUTH0_DOMAIN}/oauth/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: process.env.AUTH0_M2M_CLIENT_ID,
        client_secret: process.env.AUTH0_M2M_CLIENT_SECRET,
        audience: process.env.AUTH0_API_AUDIENCE,
      }),
    },
  );

  const data = await response.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + data.expires_in * 1000;

  return cachedToken;
}

export async function handler(event) {
  const token = await getM2MToken();

  // Use token to call protected APIs
  const response = await fetch(
    `${process.env.API_BASE_URL}/internal/validate-batch`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ licenses: event.licenses }),
    },
  );

  return response.json();
}
```

### 8.6 Rate Limiting

```yaml
# API Gateway rate limiting
Resources:
  ApiUsagePlan:
    Type: AWS::ApiGateway::UsagePlan
    Properties:
      UsagePlanName: HicApiUsagePlan
      Throttle:
        BurstLimit: 100 # Max concurrent requests
        RateLimit: 50 # Requests per second
      Quota:
        Limit: 10000 # Requests per day
        Period: DAY
```

---

## 9. Account Lifecycle Security

### 9.1 Post-Payment Account Creation Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│            SECURE ACCOUNT CREATION (Post-Payment)                            │
└─────────────────────────────────────────────────────────────────────────────┘

    1. User completes Stripe checkout
           │
           ▼
    2. Stripe webhook: checkout.session.completed
       - Create pending customer record in DynamoDB
       - Generate account_creation_token (cryptographically random)
       - Store: { token, email, stripeCustomerId, expiresAt: +1 hour }
           │
           ▼
    3. User redirected to /welcome?session_id=xxx
       - Validate session_id with Stripe
       - Look up pending customer by session
       - Pre-fill email (read-only)
           │
           ▼
    4. User creates password OR chooses social login
           │
           ├─── Password: Auth0 creates user with pre-verified email
           │
           └─── Social: Auth0 links if same email, otherwise creates new
           │
           ▼
    5. Auth0 Action: Post-Login
       - Link Auth0 user to pending customer record
       - Update customer: status = ACTIVE, auth0UserId = user.sub
       - Clear account_creation_token
           │
           ▼
    6. Create Keygen license, send welcome email
           │
           ▼
    7. Redirect to /portal with active session
```

### 9.2 Password Policy

Configure in Auth0 Dashboard → Database Connections:

| Policy               | Setting            | Rationale                                |
| -------------------- | ------------------ | ---------------------------------------- |
| **Minimum length**   | 12 characters      | NIST SP 800-63B recommendation           |
| **Maximum length**   | 128 characters     | Allow passphrases                        |
| **Complexity**       | No arbitrary rules | NIST recommends against complexity rules |
| **Common passwords** | Blocked            | Check against breach databases           |
| **Personal info**    | Blocked            | Prevent email/name in password           |
| **History**          | Last 5 passwords   | Prevent reuse                            |

```javascript
// Auth0 Database Connection - Password Policy
{
  "passwordPolicy": "excellent",
  "password_complexity_options": {
    "min_length": 12
  },
  "password_history": {
    "enable": true,
    "size": 5
  },
  "password_no_personal_info": {
    "enable": true
  },
  "password_dictionary": {
    "enable": true
  }
}
```

### 9.3 Multi-Factor Authentication (MFA)

**Enterprise Users (Required):**

```javascript
// Auth0 Action: Post-Login - Enforce MFA for Enterprise
exports.onExecutePostLogin = async (event, api) => {
  // Enterprise users in an organization must have MFA
  if (event.organization) {
    const enrolledFactors = event.user.multifactor || [];

    if (enrolledFactors.length === 0) {
      // Force MFA enrollment
      api.authentication.enrollWithAny([
        { type: "otp" }, // Authenticator app
        { type: "webauthn-roaming" }, // Security key
      ]);
    } else {
      // Challenge with enrolled factor
      api.authentication.challengeWithAny(
        enrolledFactors.map((f) => ({ type: f })),
      );
    }
  }
};
```

**Individual Users (Encouraged):**

```javascript
// Auth0 Action: Post-Login - Encourage MFA for Individuals
exports.onExecutePostLogin = async (event, api) => {
  if (!event.organization) {
    // Individual user
    const enrolledFactors = event.user.multifactor || [];

    if (enrolledFactors.length === 0) {
      // Track MFA prompt state to avoid nagging
      const mfaPromptCount = event.user.app_metadata.mfa_prompt_count || 0;
      const lastPrompt = event.user.app_metadata.mfa_last_prompt;
      const daysSincePrompt = lastPrompt
        ? (Date.now() - new Date(lastPrompt)) / (1000 * 60 * 60 * 24)
        : Infinity;

      // Prompt every 30 days, max 5 times total
      if (mfaPromptCount < 5 && daysSincePrompt > 30) {
        // Set flag for frontend to show MFA encouragement modal
        api.idToken.setCustomClaim("https://hic-ai.com/show_mfa_prompt", true);

        // Update prompt tracking (via Management API or separate action)
      }
    }
  }
};
```

### 9.4 Account Recovery

```javascript
// Auth0 supports built-in password reset flow
// Configure in Dashboard → Branding → Universal Login → Password Reset

// For additional security, track recovery attempts
exports.onExecutePostChangePassword = async (event, api) => {
  // Log password change for security audit
  console.log("Password changed", {
    userId: event.user.user_id,
    email: event.user.email,
    timestamp: new Date().toISOString(),
    ip: event.request.ip,
    userAgent: event.request.user_agent,
  });

  // Notify user of password change
  await sendEmail(event.user.email, "password-changed", {
    timestamp: new Date().toISOString(),
    ip: event.request.ip,
  });
};
```

### 9.5 Account Deletion

```javascript
// app/api/account/delete/route.js
import { getSession } from "@auth0/nextjs-auth0";
import { ManagementClient } from "auth0";

export async function DELETE(request) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { confirmEmail, confirmPhrase } = await request.json();

  // Verify confirmation
  if (confirmEmail !== session.user.email) {
    return Response.json({ error: "Email does not match" }, { status: 400 });
  }

  if (confirmPhrase !== "DELETE MY ACCOUNT") {
    return Response.json(
      { error: "Invalid confirmation phrase" },
      { status: 400 },
    );
  }

  const userId = session.user.sub;

  // Check if user is Billing Contact - cannot delete if so
  const orgRoles = session.user["https://hic-ai.com/org_roles"] || [];
  if (orgRoles.includes("org_billing")) {
    return Response.json(
      { error: "Transfer Billing Contact role before deleting account" },
      { status: 400 },
    );
  }

  // 1. Revoke Keygen license
  await revokeLicenseForUser(userId);

  // 2. Cancel Stripe subscription (if any active)
  const customer = await getCustomerByAuth0Id(userId);
  if (customer?.stripeCustomerId) {
    await cancelAllSubscriptions(customer.stripeCustomerId);
  }

  // 3. Delete from DynamoDB
  await deleteCustomerRecord(customer.customerId);

  // 4. Delete from Auth0
  const management = new ManagementClient({
    domain: process.env.AUTH0_DOMAIN,
    clientId: process.env.AUTH0_MGMT_CLIENT_ID,
    clientSecret: process.env.AUTH0_MGMT_CLIENT_SECRET,
  });

  await management.users.delete({ id: userId });

  // 5. Log deletion for compliance
  await logAccountDeletion({
    userId,
    email: session.user.email,
    timestamp: new Date().toISOString(),
    requestIp: request.headers.get("x-forwarded-for"),
  });

  return Response.json({ success: true, message: "Account deleted" });
}
```

### 9.6 Account Linking (Social ↔ Password)

```javascript
// Auth0 Action: Post-Login - Link Accounts by Email
exports.onExecutePostLogin = async (event, api) => {
  // Skip if user already has linked identities
  if (event.user.identities && event.user.identities.length > 1) {
    return;
  }

  const ManagementClient = require("auth0").ManagementClient;
  const management = new ManagementClient({
    domain: event.secrets.AUTH0_DOMAIN,
    clientId: event.secrets.AUTH0_MGMT_CLIENT_ID,
    clientSecret: event.secrets.AUTH0_MGMT_CLIENT_SECRET,
  });

  // Search for other users with same verified email
  const email = event.user.email;
  if (!event.user.email_verified) {
    return; // Only link verified emails
  }

  const users = await management.users.getByEmail(email);

  // Find users to link (exclude current user)
  const usersToLink = users.filter(
    (u) => u.user_id !== event.user.user_id && u.email_verified,
  );

  if (usersToLink.length === 0) {
    return;
  }

  // Determine primary account (oldest or has subscription)
  const primaryUser = await determinePrimaryAccount(
    usersToLink.concat(event.user),
  );

  if (primaryUser.user_id !== event.user.user_id) {
    // Current login is secondary - link to primary
    const secondaryProvider = event.user.identities[0].provider;
    const secondaryUserId = event.user.identities[0].user_id;

    await management.users.link(primaryUser.user_id, {
      provider: secondaryProvider,
      user_id: secondaryUserId,
    });

    // Delete the now-linked secondary user record
    await management.users.delete({ id: event.user.user_id });

    // Continue session as primary user
    api.authentication.setPrimaryUser(primaryUser.user_id);
  }
};

async function determinePrimaryAccount(users) {
  // Prefer user with active subscription
  for (const user of users) {
    if (user.app_metadata?.has_subscription) {
      return user;
    }
  }

  // Otherwise, oldest account
  return users.sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at),
  )[0];
}
```

---

## 10. OWASP & CWE Alignment

### 10.1 Relevant CWE Entries

| CWE ID      | Name                                            | Auth Context                   | Mitigation                                         |
| ----------- | ----------------------------------------------- | ------------------------------ | -------------------------------------------------- |
| **CWE-287** | Improper Authentication                         | Weak authentication mechanisms | OAuth 2.1 with PKCE, MFA for enterprise            |
| **CWE-288** | Authentication Bypass Using Alternate Path      | Direct API access without auth | JWT validation at API Gateway                      |
| **CWE-294** | Authentication Bypass by Capture-replay         | Token replay attacks           | Short-lived tokens, refresh rotation               |
| **CWE-306** | Missing Authentication for Critical Function    | Unprotected endpoints          | Middleware + API Gateway authorizers               |
| **CWE-307** | Improper Restriction of Excessive Auth Attempts | Brute force attacks            | Auth0 built-in brute force protection              |
| **CWE-308** | Use of Single-factor Authentication             | Password-only authentication   | MFA required (enterprise), encouraged (individual) |
| **CWE-384** | Session Fixation                                | Session hijacking              | New session ID after authentication                |
| **CWE-521** | Weak Password Requirements                      | Easily guessed passwords       | 12+ chars, breach checking, no complexity rules    |
| **CWE-522** | Insufficiently Protected Credentials            | Credentials in transit/storage | TLS everywhere, Auth0 stores credentials           |
| **CWE-598** | Use of GET Request Method for Sensitive Data    | Tokens in URLs                 | Tokens in Authorization header only                |
| **CWE-601** | URL Redirection to Untrusted Site               | Open redirect                  | Strict redirect URL validation                     |
| **CWE-613** | Insufficient Session Expiration                 | Stale sessions                 | 24h absolute, 12h rolling expiry                   |
| **CWE-614** | Sensitive Cookie Without Secure Flag            | Cookie theft over HTTP         | Secure flag on all cookies                         |
| **CWE-640** | Weak Password Recovery Mechanism                | Account takeover               | Auth0 managed recovery with email verification     |
| **CWE-798** | Use of Hard-coded Credentials                   | Secrets in code                | Environment variables, no hardcoding               |
| **CWE-862** | Missing Authorization                           | Access to other users' data    | RBAC enforcement, resource ownership checks        |
| **CWE-863** | Incorrect Authorization                         | Privilege escalation           | Strict role hierarchy, claim validation            |

### 10.2 OWASP API Security Top 10 (2023)

| OWASP ID       | Risk                                            | Implementation                                                   |
| -------------- | ----------------------------------------------- | ---------------------------------------------------------------- |
| **API1:2023**  | Broken Object Level Authorization               | Verify user owns resource (license, org) before access           |
| **API2:2023**  | Broken Authentication                           | OAuth 2.1 with PKCE, JWT validation, MFA                         |
| **API3:2023**  | Broken Object Property Level Authorization      | Return only allowed fields per role                              |
| **API4:2023**  | Unrestricted Resource Consumption               | Rate limiting at API Gateway                                     |
| **API5:2023**  | Broken Function Level Authorization             | Role-based route protection (org_billing, org_admin, org_member) |
| **API6:2023**  | Unrestricted Access to Sensitive Business Flows | Delete org requires Billing Contact + confirmation phrase        |
| **API7:2023**  | Server Side Request Forgery                     | No user-controlled URLs in backend requests                      |
| **API8:2023**  | Security Misconfiguration                       | Secure defaults, CSP headers, no debug in production             |
| **API9:2023**  | Improper Inventory Management                   | API versioning (/api/v1/), documented endpoints only             |
| **API10:2023** | Unsafe Consumption of APIs                      | Validate Auth0/Stripe responses, handle errors securely          |

### 10.3 OWASP Authentication Cheat Sheet Alignment

| Guideline                                            | Implementation                                      |
| ---------------------------------------------------- | --------------------------------------------------- |
| **Implement proper password strength controls**      | 12+ chars, breach DB check, no complexity rules     |
| **Implement secure password recovery mechanism**     | Auth0 email-based with verification                 |
| **Store passwords in a secure fashion**              | Auth0 handles with bcrypt                           |
| **Transmit passwords only over TLS**                 | All Auth0 communication over HTTPS                  |
| **Require re-authentication for sensitive features** | MFA challenge for payment changes                   |
| **Use MFA for sensitive accounts**                   | Required for enterprise, encouraged for individuals |
| **Log all authentication activity**                  | Auth0 logs + custom audit events                    |

### 10.4 OAuth 2.0 Security Best Current Practice (BCP)

| BCP Requirement               | Implementation                                 |
| ----------------------------- | ---------------------------------------------- |
| **PKCE for all clients**      | ✅ Auth0 SDK enables by default                |
| **Exact redirect URI match**  | ✅ Configured in Auth0 application             |
| **State parameter for CSRF**  | ✅ Auth0 SDK generates automatically           |
| **Refresh token rotation**    | ✅ Enabled in Auth0 settings                   |
| **Short-lived access tokens** | ✅ 1 hour expiry                               |
| **No implicit grant**         | ✅ Using authorization code only               |
| **Sender-constrained tokens** | ⚠️ Optional (DPoP) - not implemented initially |

---

## 11. Pre-Launch Checklist

### 11.1 Auth0 Configuration

- [ ] `AUTH0_SECRET` generated with `openssl rand -hex 32`
- [ ] Application type set to "Regular Web Application"
- [ ] Allowed Callback URLs configured (exact match)
- [ ] Allowed Logout URLs configured
- [ ] Allowed Web Origins configured
- [ ] Token expiration settings configured (1h access, 24h refresh)
- [ ] Refresh token rotation enabled
- [ ] ID token and access token signing algorithm set to RS256
- [ ] Social connections configured (Google, GitHub)
- [ ] Database connection password policy set to "Excellent"
- [ ] Brute force protection enabled
- [ ] Breached password detection enabled

### 11.2 Auth0 Organizations (Enterprise)

- [ ] Organizations feature enabled
- [ ] Default organization roles created (org_billing, org_admin, org_member)
- [ ] Organization login prompt configured
- [ ] Member invitation flow tested
- [ ] SAML/OIDC enterprise connection template ready

### 11.3 MFA Configuration

- [ ] MFA enabled for Auth0 tenant
- [ ] WebAuthn (security keys) enabled
- [ ] TOTP (authenticator apps) enabled
- [ ] Post-login Action for enterprise MFA enforcement deployed
- [ ] Recovery codes enabled for MFA fallback

### 11.4 Custom Claims (Actions)

- [ ] Post-login Action for custom claims deployed
- [ ] Claims namespace uses `https://hic-ai.com/`
- [ ] Claims include: customer_id, account_type, org_id, org_roles
- [ ] Claims added to both ID token and access token

### 11.5 Frontend Security

- [ ] CSP headers configured for Auth0 domains
- [ ] X-Frame-Options: DENY
- [ ] Middleware protecting /portal/_ and /admin/_
- [ ] Redirect URL validation implemented
- [ ] Error messages don't leak authentication details

### 11.6 API Gateway / Backend

- [ ] JWT authorizer configured with correct issuer and audience
- [ ] JWKS caching configured
- [ ] Lambda functions validate custom claims
- [ ] Resource ownership verified before data access
- [ ] Rate limiting configured
- [ ] M2M application configured for scheduled jobs

### 11.7 Logging & Monitoring

- [ ] Auth0 logs streaming enabled (to CloudWatch or Datadog)
- [ ] Failed login alerts configured
- [ ] Suspicious IP detection enabled
- [ ] Account deletion audit logging implemented
- [ ] Anomaly detection alerts for unusual authentication patterns

### 11.8 Account Lifecycle

- [ ] Post-payment account creation flow tested
- [ ] Password reset flow tested
- [ ] Social login → password linking tested
- [ ] Account deletion flow tested (with Billing Contact restriction)
- [ ] Billing Contact transfer flow tested

---

## 12. Additional Resources

### 12.1 Auth0 Documentation

- [Next.js SDK Quickstart](https://auth0.com/docs/quickstart/webapp/nextjs)
- [Organizations](https://auth0.com/docs/manage-users/organizations)
- [RBAC with Organizations](https://auth0.com/docs/manage-users/organizations/configure-rbac-for-organizations)
- [Token Best Practices](https://auth0.com/docs/secure/tokens/token-best-practices)
- [Refresh Token Rotation](https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation)
- [Actions](https://auth0.com/docs/customize/actions)
- [Attack Protection](https://auth0.com/docs/secure/attack-protection)

### 12.2 Security Standards

- [OWASP API Security Top 10 (2023)](https://owasp.org/API-Security/)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OAuth 2.0 Security Best Current Practice](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-security-topics)
- [NIST SP 800-63B Digital Identity Guidelines](https://pages.nist.gov/800-63-3/sp800-63b.html)
- [CWE Common Weakness Enumeration](https://cwe.mitre.org/)

### 12.3 Related HIC AI Documents

- [PLG Technical Specification v2](./20260122_GC_PLG_TECHNICAL_SPECIFICATION_v2.md)
- [API Map v2](./20260122_GC_API_MAP_FOR_HIC_AI_WEBSITE_v2.md)
- [User Journey & Guest Checkout v2](./20260122_GC_USER_JOURNEY_AND_GUEST_CHECKOUT_v2.md)
- [Security Considerations for Next.js](./20260122_SECURITY_CONSIDERATIONS_FOR_NEXTJS_PROJECT.md)
- [Security Considerations for Stripe](./20260122_SECURITY_CONSIDERATIONS_FOR_STRIPE_PAYMENTS.md)
- [Security Considerations for Keygen](./20260122_SECURITY_CONSIDERATIONS_FOR_KEYGEN_LICENSING.md)

---

## 13. Document History

| Date       | Author         | Change           |
| ---------- | -------------- | ---------------- |
| 2026-01-22 | GitHub Copilot | Initial creation |

---

_This document should be reviewed and updated as the authentication architecture evolves and new Auth0 features are adopted._
