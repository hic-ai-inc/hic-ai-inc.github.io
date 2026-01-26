# Team Admin Portal — Implementation Plan

**TO:** Development Team  
**FROM:** GitHub Copilot (GC)  
**DATE:** January 25, 2026  
**RE:** Implementation Plan for Portal & Team Admin Features

**Status:** APPROVED — BLOCKING PLG LAUNCH

---

## Executive Summary

The Team Admin Portal is required before Mouse can ship. Without it, "Team" tier is just bulk individual licenses with no management capability. This document details all work required to complete:

1. **Individual Portal** — Account settings, payment history, billing for solo users
2. **Team Admin Portal** — Member management, invites, revocation for team admins
3. **Route Protection** — Both portals require authentication; team features require role checks

**Estimated Effort:** 3-4 days  
**Dependencies:** Auth0 configured, Stripe configured, DynamoDB schema deployed

---

## 1. Current State Audit

### 1.1 What's Built ✅

| Component | Location | Status |
|-----------|----------|--------|
| Role-based auth | `src/lib/auth.js` | ✅ Complete |
| `org_billing` / `org_admin` / `org_member` roles | `auth.js:66-86` | ✅ Defined |
| `isBillingContact()` / `isAdmin()` helpers | `auth.js:121-133` | ✅ Built |
| Route protection middleware | `src/middleware.js` | ✅ Built |
| DynamoDB: `getOrgMembers()` | `src/lib/dynamodb.js:447` | ✅ Built |
| DynamoDB: `updateOrgMemberStatus()` | `src/lib/dynamodb.js:472` | ✅ Built |
| DynamoDB: `getOrgLicenseUsage()` | `src/lib/dynamodb.js:512` | ✅ Built |
| Email: `licenseRevoked` template | `src/lib/ses.js:414` | ✅ Built |
| Email: `enterpriseInvite` template | `src/lib/ses.js:612` | ✅ Built |
| Portal: `/portal` dashboard | `src/app/portal/page.js` | ✅ Built |
| Portal: `/portal/billing` | `src/app/portal/billing/page.js` | ✅ Built |
| Portal: `/portal/invoices` | `src/app/portal/invoices/` | ✅ Built + API |
| Portal: `/portal/settings` | `src/app/portal/settings/page.js` | ✅ Built |
| Portal: `/portal/license` | `src/app/portal/license/` | ✅ Built |
| Portal: `/portal/devices` | `src/app/portal/devices/` | ✅ Built |
| Portal: `/portal/team` UI | `src/app/portal/team/page.js` | ⚠️ Mock data only |

### 1.2 What's Missing ❌

| Component | Priority | Effort |
|-----------|----------|--------|
| API: `GET /api/portal/team` | P0 | 2 hrs |
| API: `POST /api/portal/team/invite` | P0 | 3 hrs |
| API: `DELETE /api/portal/team/:memberId` | P0 | 2 hrs |
| API: `PATCH /api/portal/team/:memberId/role` | P1 | 2 hrs |
| API: `POST /api/portal/team/invite/:token/accept` | P0 | 3 hrs |
| Wire `/portal/team` to real API | P0 | 3 hrs |
| Invite modal component | P0 | 2 hrs |
| Invite acceptance page | P0 | 2 hrs |
| Individual vs Team portal routing | P0 | 1 hr |
| Billing Contact transfer flow | P2 | 4 hrs |

---

## 2. Role & Permission Model

### 2.1 Role Hierarchy

```
org_billing (Billing Contact / Owner)
    ├── Can: Everything
    ├── Can: Cancel subscription
    ├── Can: Change billing contact
    ├── Can: Delete organization
    └── Unique: Only 1 per organization

org_admin (Admin)
    ├── Can: Invite members
    ├── Can: Revoke members
    ├── Can: Change member → admin (and vice versa)
    ├── Cannot: Cancel subscription
    ├── Cannot: Change billing contact
    └── Multiple allowed

org_member (Member)
    ├── Can: View own license
    ├── Can: Manage own devices
    ├── Cannot: Access /portal/team
    └── Cannot: See other members
```

### 2.2 Route Protection Matrix

| Route | Individual | Team Member | Team Admin | Billing Contact |
|-------|------------|-------------|------------|-----------------|
| `/portal` | ✅ | ✅ | ✅ | ✅ |
| `/portal/license` | ✅ | ✅ | ✅ | ✅ |
| `/portal/devices` | ✅ | ✅ | ✅ | ✅ |
| `/portal/settings` | ✅ | ✅ | ✅ | ✅ |
| `/portal/billing` | ✅ | ❌ | ❌ | ✅ |
| `/portal/invoices` | ✅ | ❌ | ❌ | ✅ |
| `/portal/team` | ❌ | ❌ | ✅ | ✅ |
| `/portal/team/invite` | ❌ | ❌ | ✅ | ✅ |

**Key Insight:** Individual users see billing. Team members do NOT see billing (their admin handles it). Only admins/billing contacts see team management.

---

## 3. API Specifications

### 3.1 GET /api/portal/team

**Purpose:** List all team members and invites  
**Auth:** `requireAdmin()`  
**Response:**

```json
{
  "organization": {
    "id": "org_abc123",
    "name": "Acme Corp",
    "seatLimit": 10,
    "seatsUsed": 4
  },
  "members": [
    {
      "id": "user_1",
      "email": "owner@acme.com",
      "name": "Jane Owner",
      "role": "owner",
      "status": "active",
      "activeSessions": 2,
      "maxSessions": 5,
      "joinedAt": "2026-01-01T00:00:00Z"
    },
    {
      "id": "user_2",
      "email": "dev@acme.com",
      "name": "Bob Developer",
      "role": "member",
      "status": "active",
      "activeSessions": 1,
      "maxSessions": 5,
      "joinedAt": "2026-01-15T00:00:00Z"
    }
  ],
  "pendingInvites": [
    {
      "id": "inv_xyz",
      "email": "newbie@acme.com",
      "role": "member",
      "invitedBy": "owner@acme.com",
      "invitedAt": "2026-01-20T00:00:00Z",
      "expiresAt": "2026-01-27T00:00:00Z"
    }
  ]
}
```

### 3.2 POST /api/portal/team/invite

**Purpose:** Invite a new team member  
**Auth:** `requireAdmin()`  
**Request:**

```json
{
  "email": "newuser@acme.com",
  "role": "member"
}
```

**Response:**

```json
{
  "success": true,
  "invite": {
    "id": "inv_abc123",
    "email": "newuser@acme.com",
    "role": "member",
    "expiresAt": "2026-02-01T00:00:00Z"
  }
}
```

**Side Effects:**
1. Creates `INVITE#inv_abc123` record in DynamoDB
2. Sends `enterpriseInvite` email via SES
3. Does NOT consume a seat until accepted

**Error Cases:**
- `400`: Email already a member
- `400`: Pending invite exists for email
- `403`: No available seats
- `403`: Caller lacks admin role

### 3.3 DELETE /api/portal/team/members/:memberId

**Purpose:** Revoke a team member's access  
**Auth:** `requireAdmin()` + cannot revoke billing contact  
**Request:** None (memberId in URL)  
**Response:**

```json
{
  "success": true,
  "message": "Member access revoked"
}
```

**Side Effects:**
1. Sets member status to `REVOKED` in DynamoDB
2. Revokes KeyGen license
3. Sends `licenseRevoked` email
4. Frees up seat

**Error Cases:**
- `403`: Cannot revoke billing contact
- `403`: Cannot revoke yourself
- `404`: Member not found

### 3.4 PATCH /api/portal/team/members/:memberId/role

**Purpose:** Change member's role (member ↔ admin)  
**Auth:** `requireAdmin()` + special rules  
**Request:**

```json
{
  "role": "admin"
}
```

**Response:**

```json
{
  "success": true,
  "member": {
    "id": "user_2",
    "role": "admin"
  }
}
```

**Rules:**
- Admins can promote member → admin
- Admins can demote admin → member
- Only billing contact can demote another admin if they're the last admin
- Cannot change billing contact's role (use transfer flow instead)

### 3.5 POST /api/portal/team/invite/:token/accept

**Purpose:** Accept an invitation and create account  
**Auth:** None (token is auth)  
**Request:**

```json
{
  "token": "inv_abc123_secrettoken"
}
```

**Response:**

```json
{
  "success": true,
  "redirect": "/api/auth/login?returnTo=/portal"
}
```

**Flow:**
1. Validate token exists and not expired
2. Create user in Auth0 (or link if email exists)
3. Add user to organization with role from invite
4. Create license in KeyGen
5. Send `licenseActivated` email
6. Delete invite record
7. Redirect to Auth0 login → portal

### 3.6 DELETE /api/portal/team/invites/:inviteId

**Purpose:** Cancel a pending invite  
**Auth:** `requireAdmin()`  
**Response:**

```json
{
  "success": true,
  "message": "Invite cancelled"
}
```

---

## 4. DynamoDB Schema Additions

### 4.1 Invite Entity (New)

```
PK: ORG#org_abc123
SK: INVITE#inv_xyz789
GSI1PK: INVITE_TOKEN#secrettoken123
GSI1SK: INVITE_TOKEN#secrettoken123

{
  "entityType": "INVITE",
  "inviteId": "inv_xyz789",
  "orgId": "org_abc123",
  "email": "newuser@acme.com",
  "role": "member",
  "token": "secrettoken123",
  "invitedBy": "user_1",
  "invitedByEmail": "owner@acme.com",
  "status": "pending",
  "createdAt": "2026-01-25T10:00:00Z",
  "expiresAt": "2026-02-01T10:00:00Z",
  "TTL": 1738407600
}
```

### 4.2 Access Patterns

| Pattern | Keys | Purpose |
|---------|------|---------|
| Get org invites | PK=`ORG#id`, SK begins_with `INVITE#` | List pending invites |
| Lookup by token | GSI1PK=`INVITE_TOKEN#token` | Accept invite |
| TTL auto-delete | TTL attribute | Clean expired invites |

### 4.3 Required DynamoDB Functions

```javascript
// New functions needed in dynamodb.js

export async function createInvite(orgId, email, role, invitedBy) { ... }
export async function getInviteByToken(token) { ... }
export async function getOrgInvites(orgId) { ... }
export async function deleteInvite(orgId, inviteId) { ... }
export async function acceptInvite(token, userId) { ... }
```

---

## 5. Frontend Implementation

### 5.1 Individual Portal Layout

For `accountType === 'individual'`:

```
/portal
├── Dashboard (license status, quick actions)
├── /license (license key, copy button)
├── /devices (active sessions, deactivate)
├── /billing (current plan, payment method, upgrade)
├── /invoices (payment history, download receipts)
└── /settings (profile, notifications, delete account)
```

### 5.2 Team Member Portal Layout

For `accountType === 'team'` AND `role === 'member'`:

```
/portal
├── Dashboard (license status, team info)
├── /license (license key, copy button)
├── /devices (active sessions, deactivate)
└── /settings (profile, notifications)

NOT VISIBLE:
├── /billing (managed by admin)
├── /invoices (managed by admin)
└── /team (admin only)
```

### 5.3 Team Admin Portal Layout

For `accountType === 'team'` AND `role in ['admin', 'owner']`:

```
/portal
├── Dashboard (team overview, seat usage)
├── /team (member list, invite, revoke)
│   ├── InviteModal component
│   ├── RoleChangeDropdown component
│   └── RevokeConfirmDialog component
├── /license (own license)
├── /devices (own devices)
├── /billing (if owner: plan, payment, upgrade)
├── /invoices (if owner: payment history)
└── /settings (profile, notifications)
```

### 5.4 Portal Navigation Component

Update `src/app/portal/layout.js`:

```javascript
const getNavItems = (accountType, role) => {
  const base = [
    { href: '/portal', label: 'Dashboard', icon: HomeIcon },
    { href: '/portal/license', label: 'License', icon: KeyIcon },
    { href: '/portal/devices', label: 'Devices', icon: DeviceIcon },
    { href: '/portal/settings', label: 'Settings', icon: SettingsIcon },
  ];

  // Individual users see billing
  if (accountType === 'individual') {
    base.splice(3, 0, 
      { href: '/portal/billing', label: 'Billing', icon: CreditCardIcon },
      { href: '/portal/invoices', label: 'Invoices', icon: ReceiptIcon },
    );
  }

  // Team admins/owners see team management
  if (accountType === 'team' && ['admin', 'owner'].includes(role)) {
    base.splice(1, 0, 
      { href: '/portal/team', label: 'Team', icon: UsersIcon },
    );
  }

  // Only billing contact sees billing for teams
  if (accountType === 'team' && role === 'owner') {
    base.push(
      { href: '/portal/billing', label: 'Billing', icon: CreditCardIcon },
      { href: '/portal/invoices', label: 'Invoices', icon: ReceiptIcon },
    );
  }

  return base;
};
```

### 5.5 Invite Modal Component

New file: `src/components/InviteModal.js`

```javascript
// Props: isOpen, onClose, onInvite, availableSeats
// State: email, role, loading, error
// Validation: email format, seats available
// Submit: POST /api/portal/team/invite
```

### 5.6 Invite Acceptance Page

New file: `src/app/invite/[token]/page.js`

```
/invite/:token
├── Validate token (server-side)
├── Show: "You've been invited to join {OrgName}"
├── Show: Inviter name, role being granted
├── Button: "Accept Invitation"
├── On click: POST /api/portal/team/invite/:token/accept
└── Redirect to Auth0 login → /portal
```

---

## 6. Implementation Checklist

### Phase 1: API Endpoints (Day 1)

- [ ] `GET /api/portal/team` — List members + invites
- [ ] `POST /api/portal/team/invite` — Create invite
- [ ] `DELETE /api/portal/team/members/:id` — Revoke member
- [ ] `DELETE /api/portal/team/invites/:id` — Cancel invite
- [ ] DynamoDB: `createInvite()`, `getOrgInvites()`, `deleteInvite()`
- [ ] DynamoDB: `getInviteByToken()` with GSI

### Phase 2: Invite Flow (Day 2)

- [ ] `POST /api/portal/team/invite/:token/accept` — Accept invite
- [ ] DynamoDB: `acceptInvite()` — atomic invite→member transition
- [ ] `/invite/[token]/page.js` — Acceptance page UI
- [ ] Auth0: Add user to organization on accept
- [ ] KeyGen: Create license on accept

### Phase 3: Frontend Wire-up (Day 2-3)

- [ ] Update `/portal/team/page.js` to use real API
- [ ] Create `InviteModal` component
- [ ] Create `RevokeConfirmDialog` component
- [ ] Wire role change dropdown
- [ ] Update portal `layout.js` for role-based nav
- [ ] Protect `/portal/billing` from team members
- [ ] Protect `/portal/team` from non-admins

### Phase 4: Role Management (Day 3)

- [ ] `PATCH /api/portal/team/members/:id/role` — Change role
- [ ] Update Auth0 user metadata on role change
- [ ] Add role change dropdown to team table
- [ ] Implement "Last admin" protection logic

### Phase 5: Polish & Edge Cases (Day 4)

- [ ] Resend invite functionality
- [ ] Invite expiration handling (7-day TTL)
- [ ] "No seats available" error state
- [ ] Self-revocation prevention
- [ ] Billing contact transfer flow (P2, can defer)
- [ ] Loading states and error boundaries
- [ ] Mobile responsive team table

---

## 7. Testing Plan

### 7.1 Unit Tests

- [ ] `auth.js`: Role check functions
- [ ] `dynamodb.js`: Invite CRUD operations
- [ ] API routes: Request validation, error cases

### 7.2 Integration Tests

- [ ] Full invite flow: create → email → accept → login
- [ ] Revoke flow: revoke → email → license invalid
- [ ] Role change: member → admin permissions update

### 7.3 E2E Tests

- [ ] Individual: Login → view billing → pay invoice
- [ ] Team admin: Login → invite → see pending → cancel
- [ ] Team member: Login → cannot see team page → 403
- [ ] Invite acceptance: Click email link → accept → see portal

---

## 8. Security Considerations

### 8.1 Invite Token Security

- Tokens are cryptographically random (32 bytes, base64)
- Tokens expire after 7 days (TTL)
- Tokens are single-use (deleted on accept)
- Token lookup uses GSI, not scan

### 8.2 Role Escalation Prevention

- `requireAdmin()` checks Auth0 JWT claims, not database
- Role changes update Auth0 immediately (not just DB)
- Billing contact role cannot be changed via PATCH
- Self-demotion requires confirmation

### 8.3 Rate Limiting

- Invite endpoint: 10/hour per org (prevent spam)
- Invite accept: 5/hour per IP (prevent brute force)
- Implement via Vercel Edge middleware or API rate limiter

---

## 9. Pricing Documentation Updates

The following documents need updates to remove Enterprise tier:

- [ ] `20260125_ADDENDUM_PRICING_MODEL_v3_CONCURRENT_SESSIONS.md`
- [ ] `20260125_PRICING_v3_IMPLEMENTATION_CHECKLIST.md`
- [ ] Website pricing page (`/pricing`)
- [ ] Checkout flows (remove enterprise checkout)

**New Pricing (2 tiers):**

| Tier | Price | Sessions | Admin Portal |
|------|-------|----------|--------------|
| Individual | $15/mo | 2 | Self-serve only |
| Team | $35/mo | 5 per seat | ✅ Full admin portal |

**Enterprise:** "Contact Sales" placeholder (no self-serve)

---

## 10. Launch Blockers

The following MUST be complete before Mouse PLG launch:

| Item | Status | Owner |
|------|--------|-------|
| Individual portal (billing/invoices visible) | ⚠️ Needs nav update | GC |
| Team admin portal (real data, not mock) | ❌ Not started | GC |
| Invite flow (create → email → accept) | ❌ Not started | GC |
| Revoke flow (revoke → email → license dead) | ❌ Not started | GC |
| Route protection (team page admin-only) | ⚠️ Middleware exists, needs page guards | GC |
| Remove Enterprise from pricing/checkout | ❌ Not started | GC |

---

## Appendix A: File Change Summary

### New Files

```
src/app/api/portal/team/route.js                    # GET team, POST invite
src/app/api/portal/team/members/[id]/route.js       # DELETE member, PATCH role
src/app/api/portal/team/invites/[id]/route.js       # DELETE invite
src/app/invite/[token]/page.js                      # Accept invite page
src/components/InviteModal.js                       # Invite modal
src/components/RevokeConfirmDialog.js               # Revoke confirmation
```

### Modified Files

```
src/lib/dynamodb.js                                 # Add invite functions
src/app/portal/layout.js                            # Role-based navigation
src/app/portal/team/page.js                         # Wire to real API
src/app/portal/billing/page.js                      # Add role guard
src/app/portal/invoices/page.js                     # Add role guard
```

---

**Document Status:** APPROVED FOR IMPLEMENTATION  
**Next Action:** Begin Phase 1 (API Endpoints)
