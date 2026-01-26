# ADDENDUM: Pricing Model v3 — Concurrent Session Architecture

**TO:** Development Team, Technical Documentation
**FROM:** GitHub Copilot (GC)
**DATE:** January 25, 2026
**RE:** Addendum to PLG Technical Specifications — Pricing Model Restructure

**Supersedes:**

- 20260122_GC_PROPOSED_PRICING_CHANGES_FOR_PLG_IMPLEMENTATION.md (partial)
- Pricing sections in 20260122_GC_PLG_TECHNICAL_SPECIFICATION_v2.md
- Pricing sections in 20260124_MOUSE_LICENSING_TRIAL_IMPLEMENTATION_PLAN.md

**Status:** APPROVED FOR IMPLEMENTATION

---

## Executive Summary

This addendum documents a fundamental restructure of the Mouse pricing and licensing model based on insights from market analysis (GPT-5.2 peer review, January 25, 2026). The changes address three critical issues:

1. **Container penalty problem**: Device-based licensing punishes developers using Docker, devcontainers, and ephemeral environments
2. **Enterprise underpricing**: Previous $25-35/seat signaled "not enterprise-ready" relative to market anchors
3. **Agent farm ambiguity**: No clear mechanism to monetize automation/CI use cases

**Key Changes:**

| Aspect          | Previous Model                                                       | New Model                                       |
| --------------- | -------------------------------------------------------------------- | ----------------------------------------------- |
| **Tiers**       | OSS / Individual / Power User / Enterprise Std / Enterprise Premiere | **Individual / Team / Enterprise / Automation** |
| **Pricing**     | $0 / $15 / $25 / $25 / $35                                           | **$15 / $35 / $49 / Contact Sales**             |
| **Enforcement** | Device count (permanent activations)                                 | **Concurrent sessions (heartbeat-based)**       |
| **Trial**       | Device-based, no signup                                              | Device-based, no signup (unchanged)             |
| **Licensed**    | Device-based validation                                              | **User-identity + heartbeat concurrency**       |

---

## 1. New Pricing Structure

### 1.1 Four-Tier Model

| Tier           | Price         | Concurrent Sessions  | Target                        | Signup Required |
| -------------- | ------------- | -------------------- | ----------------------------- | --------------- |
| **Individual** | $15/seat/mo   | 2                    | Solo developers, PLG funnel   | At payment      |
| **Team**       | $35/seat/mo   | 5                    | Default B2B, manager-friendly | At payment      |
| **Enterprise** | $49/seat/mo   | 10                   | SSO, SCIM, priority support     | At payment      |
| **Automation** | Contact Sales | Per concurrent agent | Agent farms, CI/CD            | Sales process   |

\> **Note:** Enterprise tier includes SSO/SAML integration, SCIM provisioning for license reassignment, priority support SLA, and audit logging.

### 1.2 Removed Tiers

The following tiers are **deprecated and removed**:

- ~~Power User ($25/mo, 6 devices)~~ → Absorbed into **Team**
- ~~Enterprise Standard ($25/seat/mo, 2 devices)~~ → Replaced by **Team**
- ~~Enterprise Premiere ($35/seat/mo, 6 devices)~~ → Replaced by **Enterprise**
- ~~Open Source ($0)~~ → Deferred to post-launch (manual process if needed)

### 1.3 Annual Pricing

| Tier       | Monthly | Annual    | Savings             |
| ---------- | ------- | --------- | ------------------- |
| Individual | $15/mo  | $150/year | 17% (2 months free) |
| Team       | $35/mo  | $350/year | 17% (2 months free) |
| Enterprise | $49/mo  | $490/year | 17% (2 months free) |

Team and Enterprise require annual billing minimum for volume discounts.

### 1.4 Volume Discounts (Team & Enterprise)

| Seat Count | Discount | Team Effective | Enterprise Effective |
| ---------- | -------- | -------------- | -------------------- |
| 5-49       | 0%       | $35/seat/mo    | $49/seat/mo          |
| 50-99      | 10%      | $31.50/seat/mo | $44.10/seat/mo       |
| 100-499    | 15%      | $29.75/seat/mo | $41.65/seat/mo       |
| 500+       | 20%      | $28/seat/mo    | $39.20/seat/mo       |

### 1.5 Enterprise Feature Differentiators

The Enterprise tier ($49/seat/mo) includes exclusive features that justify the premium over Team ($35/seat/mo):

| Feature | Individual | Team | Enterprise |
| ------- | ---------- | ---- | ---------- |
| Concurrent sessions | 2 | 5 | **10** |
| SSO/SAML integration | ❌ | ❌ | ✅ |
| SCIM provisioning | ❌ | ❌ | ✅ |
| License reassignment | Self-serve | Self-serve | **Admin portal + SCIM** |
| Support SLA | Community | Email (48h) | **Priority (4h)** |
| Audit logging | ❌ | ❌ | ✅ |
| Dedicated success manager | ❌ | ❌ | 50+ seats |
| Custom contract terms | ❌ | ❌ | Available |
| Invoice billing (NET-30) | ❌ | ❌ | ✅ |

**Why $49/mo is justified:**
1. **SSO/SAML**: Enterprises require identity federation — Okta, Azure AD, OneLogin
2. **SCIM**: Automated user provisioning/deprovisioning when employees join/leave
3. **Priority support**: 4-hour response SLA vs 48-hour for Team
4. **Audit logging**: Compliance requirement for SOC 2, HIPAA-adjacent workflows
5. **Invoice billing**: Procurement teams require NET-30 terms, not credit cards

---

## 2. Licensing Architecture Change

### 2.1 The Core Insight: Concurrent Sessions, Not Device Count

**Problem with device-count licensing:**

- Developer activates on laptop → 1 device used
- Developer opens devcontainer → 2 devices used (container has different fingerprint)
- Developer rebuilds container → 3 devices used (new fingerprint)
- Developer hits limit, frustrated

**Solution: Session-based concurrency:**

- Developer activates on laptop → 1 active session
- Developer opens devcontainer → 2 active sessions
- Developer closes laptop VS Code → 1 active session (heartbeat expired)
- Developer rebuilds container → still 1 active session
- Containers no longer matter

### 2.2 Hybrid Model: Frictionless Trial + Identity at Conversion

The PLG promise ("install from Marketplace, no signup") is preserved:

| Phase        | Identity                   | Enforcement                     | Network Required |
| ------------ | -------------------------- | ------------------------------- | ---------------- |
| **Trial**    | Device UUID (local)        | Local timer + device limit      | No               |
| **Licensed** | User (email from checkout) | Heartbeat + concurrent sessions | Yes (periodic)   |

**Trial flow (unchanged):**

1. Install from VS Code Marketplace
2. UUID generated locally on first run
3. 14-day trial starts automatically
4. 2 concurrent devices (local enforcement)
5. No signup, no email, no server call

**Licensed flow (new):**

1. User visits hic-ai.com/pricing
2. Email collected at Stripe checkout (required for payment)
3. License key emailed
4. User enters key in extension → creates session via API
5. Extension heartbeats every 5 minutes while running
6. Server tracks concurrent sessions per user
7. Stale sessions auto-expire after 15-30 minutes

### 2.3 Heartbeat Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    LICENSED USER FLOW                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  VS Code starts                                                 │
│       │                                                         │
│       ▼                                                         │
│  POST /api/license/activate                                     │
│  { licenseKey, sessionId: uuid() }                              │
│       │                                                         │
│       ▼                                                         │
│  Server: Create session in KeyGen/DynamoDB                      │
│  Response: { success, concurrentCount, maxConcurrent }          │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  HEARTBEAT LOOP (every 5 minutes)                        │   │
│  │                                                          │   │
│  │  POST /api/license/heartbeat                             │   │
│  │  { licenseKey, sessionId }                               │   │
│  │       │                                                  │   │
│  │       ▼                                                  │   │
│  │  Server: Update lastSeen timestamp                       │   │
│  │  Response: { valid, concurrentCount, maxConcurrent }     │   │
│  │       │                                                  │   │
│  │       ▼                                                  │   │
│  │  If concurrentCount > maxConcurrent:                     │   │
│  │    Show "too many devices" message                       │   │
│  │    Block tools until session count drops                 │   │
│  │                                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  VS Code closes / crashes                                       │
│       │                                                         │
│       ▼                                                         │
│  No explicit deactivation needed!                               │
│  Session expires after 15-30 min of no heartbeat                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.4 Session Expiry Rules

| Scenario                  | Behavior                                                   |
| ------------------------- | ---------------------------------------------------------- |
| VS Code closed normally   | Session expires in 15 min (no heartbeat)                   |
| VS Code crashes           | Session expires in 15 min (no heartbeat)                   |
| Network disconnected      | Cached license valid for 7 days; session on server expires |
| Container destroyed       | Session expires in 15 min (no heartbeat)                   |
| User deactivates manually | Immediate session termination                              |

---

## 3. Agent Farm Detection Strategy

### 3.1 Phase 1 Approach (Launch)

**Terms of Service enforcement + pattern logging, not technical blocking.**

Agent farms are enterprise customers who will:

- Reach out for proper licensing
- Need support and SLAs
- Pay for Automation tier willingly

### 3.2 Detection Signals (Server-Side Logging)

| Signal                | Human Pattern          | Agent Farm Pattern     |
| --------------------- | ---------------------- | ---------------------- |
| Session creation rate | 1-3/day                | 100s/hour              |
| Heartbeat regularity  | Irregular (work/sleep) | Perfectly regular 24/7 |
| API call volume       | Dozens-hundreds/day    | Thousands/hour         |
| Active hours          | 8-12 hours/day         | 24/7                   |
| Concurrent sessions   | 1-2                    | 10+                    |

### 3.3 Enforcement Approach

1. **Soft limits**: Flag accounts exceeding thresholds for manual review
2. **Outreach**: "We noticed automation usage. Let's discuss our Automation tier."
3. **Hard limits (future)**: If abuse persists, enforce via API rate limiting

### 3.4 Why Not Technical Blocking?

- Agent farms that need Mouse at scale are **valuable enterprise customers**
- They want support, SLAs, procurement-approved contracts
- Technical cat-and-mouse is expensive and user-hostile
- Better to welcome them into Automation tier with sales conversation

---

## 4. Files Requiring Updates

### 4.1 Website Backend (hic-ai-inc.github.io)

| File                                                 | Change Required                               |
| ---------------------------------------------------- | --------------------------------------------- |
| `plg-website/src/lib/constants.js`                   | Update pricing tiers, remove deprecated tiers |
| `plg-website/src/lib/keygen.js`                      | Add heartbeat endpoint, session management    |
| `plg-website/src/app/api/license/activate/route.js`  | Add session creation logic                    |
| `plg-website/src/app/api/license/heartbeat/route.js` | **NEW FILE** - Heartbeat endpoint             |
| `plg-website/src/app/api/license/validate/route.js`  | Update for session-based validation           |
| `plg-website/src/lib/dynamodb.js`                    | Add session tracking schema                   |
| `plg-website/src/app/(marketing)/pricing/page.js`    | Update pricing UI to 4 tiers                  |

### 4.2 Mouse Extension (hic)

| File                                             | Change Required                                           |
| ------------------------------------------------ | --------------------------------------------------------- |
| `mouse/src/licensing/constants.js`               | Update API endpoints, pricing tiers, remove LS references |
| `mouse/src/licensing/providers/http-provider.js` | Convert to JSON format, add heartbeat                     |
| `mouse/src/licensing/license-checker.js`         | Add heartbeat loop for licensed users                     |
| `mouse/src/licensing/license-state.js`           | Store sessionId instead of instanceId                     |

### 4.3 Documentation

| Document                                                         | Change Required                                             |
| ---------------------------------------------------------------- | ----------------------------------------------------------- |
| `20260122_GC_PLG_TECHNICAL_SPECIFICATION_v2.md`                  | Reference this addendum; mark pricing section as superseded |
| `20260122_GC_PROPOSED_PRICING_CHANGES_FOR_PLG_IMPLEMENTATION.md` | Mark as superseded                                          |
| `20260124_MOUSE_LICENSING_TRIAL_IMPLEMENTATION_PLAN.md`          | Update licensing architecture section                       |
| `PLG_ROADMAP_v2.md`                                              | Update pricing tiers and Stripe product list                |

### 4.4 External Services

| Service    | Change Required                                                      |
| ---------- | -------------------------------------------------------------------- |
| **Stripe** | Create 4 products (Individual, Team, Enterprise monthly/annual)      |
| **KeyGen** | Create 3 policies (Individual, Team, Enterprise) with session limits |
| **Auth0**  | No change (identity captured at Stripe checkout)                     |

---

## 5. Stripe Product Configuration

### 5.1 Products (6 total, down from 10)

```
PRODUCTS:
mouse_individual_monthly    $15/month
mouse_individual_annual     $150/year

mouse_team_monthly          $35/month
mouse_team_annual           $350/year

mouse_enterprise_monthly    $49/month
mouse_enterprise_annual     $490/year

COUPONS (optional, time-boxed):
EARLYADOPTER20              20% off first year (Team/Enterprise annual only)

AUTOMATION TIER:
No self-serve product — Contact Sales → custom quote
```

### 5.2 Metadata

Each Stripe product should include metadata:

```json
{
  "tier": "individual|team|enterprise",
  "maxConcurrentSessions": "2|5|10",
  "billingCycle": "monthly|annual"
}
```

---

## 6. KeyGen Policy Configuration

### 6.1 Policies (3 total)

| Policy              | Max Machines | Heartbeat Required | Overage Action       |
| ------------------- | ------------ | ------------------ | -------------------- |
| `policy_individual` | 2            | Yes (5 min)        | Block oldest session |
| `policy_team`       | 5            | Yes (5 min)        | Block oldest session |
| `policy_enterprise` | 10           | Yes (5 min)        | Soft warning, log    |

### 6.2 Machine Expiry

Configure KeyGen machine heartbeat:

- **Heartbeat interval**: 5 minutes
- **Expiry after no heartbeat**: 15 minutes
- **Resurrection window**: None (new session required)

This enables "concurrent sessions" behavior using KeyGen's machine model.

---

## 7. DynamoDB Schema Additions

### 7.1 Session Entity (New)

```json
{
  "PK": "LICENSE#lic_abc123",
  "SK": "SESSION#sess_xyz789",
  "GSI1PK": "USER#user@example.com",
  "GSI1SK": "SESSION#sess_xyz789",
  "entityType": "SESSION",
  "sessionId": "sess_xyz789",
  "licenseId": "lic_abc123",
  "keygenMachineId": "mach_123",
  "userEmail": "user@example.com",
  "deviceInfo": {
    "platform": "darwin",
    "hostname": "MacBook-Pro",
    "vscodeVersion": "1.95.0"
  },
  "createdAt": "2026-01-25T10:00:00Z",
  "lastHeartbeat": "2026-01-25T14:30:00Z",
  "status": "ACTIVE|EXPIRED"
}
```

### 7.2 Access Patterns

| Pattern                 | Keys                                         | Purpose          |
| ----------------------- | -------------------------------------------- | ---------------- |
| Get sessions by license | PK = `LICENSE#id`, SK begins_with `SESSION#` | Count concurrent |
| Get sessions by user    | GSI1PK = `USER#email`                        | Admin view       |
| Expire old sessions     | Scan where lastHeartbeat < (now - 15 min)    | Cleanup job      |

---

## 8. API Endpoint Changes

### 8.1 POST /api/license/activate (Updated)

**Request:**

```json
{
  "licenseKey": "XXXX-XXXX-XXXX-XXXX",
  "sessionId": "sess_uuid",
  "deviceInfo": {
    "platform": "darwin",
    "hostname": "MacBook-Pro",
    "vscodeVersion": "1.95.0"
  }
}
```

**Response:**

```json
{
  "success": true,
  "session": {
    "id": "sess_uuid",
    "keygenMachineId": "mach_123"
  },
  "license": {
    "id": "lic_abc123",
    "status": "active",
    "tier": "individual",
    "maxConcurrent": 2,
    "currentConcurrent": 1
  }
}
```

### 8.2 POST /api/license/heartbeat (New)

**Request:**

```json
{
  "licenseKey": "XXXX-XXXX-XXXX-XXXX",
  "sessionId": "sess_uuid"
}
```

**Response:**

```json
{
  "valid": true,
  "license": {
    "status": "active",
    "maxConcurrent": 2,
    "currentConcurrent": 1
  }
}
```

**Error Response (over limit):**

```json
{
  "valid": false,
  "error": "CONCURRENT_LIMIT_EXCEEDED",
  "license": {
    "status": "active",
    "maxConcurrent": 2,
    "currentConcurrent": 3
  },
  "message": "Too many active sessions. Close Mouse on another device or upgrade your plan."
}
```

### 8.3 POST /api/license/deactivate (Updated)

**Request:**

```json
{
  "licenseKey": "XXXX-XXXX-XXXX-XXXX",
  "sessionId": "sess_uuid"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Session deactivated"
}
```

---

## 9. Migration Path

### 9.1 Existing Code (Lemon Squeezy References)

The Mouse extension currently references Lemon Squeezy endpoints. These must be updated:

| Current                                       | New                                     |
| --------------------------------------------- | --------------------------------------- |
| `api.lemonsqueezy.com/v1/licenses/validate`   | `api.hic-ai.com/api/license/validate`   |
| `api.lemonsqueezy.com/v1/licenses/activate`   | `api.hic-ai.com/api/license/activate`   |
| `api.lemonsqueezy.com/v1/licenses/deactivate` | `api.hic-ai.com/api/license/deactivate` |
| Form-urlencoded requests                      | JSON requests                           |

### 9.2 Backward Compatibility

For any early adopters with existing licenses (if any):

- Grandfather at their original tier/price
- Migrate to session-based model transparently
- No action required from customer

---

## 10. Implementation Priority

### Phase 1: Extension Updates (Blocking)

1. Update `http-provider.js` → JSON format, your API endpoints
2. Add heartbeat mechanism to `license-checker.js`
3. Update `constants.js` with new tiers and endpoints
4. Test with mock provider

### Phase 2: Backend Updates

1. Add `/api/license/heartbeat` endpoint
2. Update `/api/license/activate` for session tracking
3. Add session expiry cleanup (scheduled Lambda or DynamoDB TTL)
4. Configure KeyGen policies

### Phase 3: Frontend Updates

1. Update pricing page UI
2. Update Stripe products
3. Test checkout flow

### Phase 4: Documentation

1. Update technical specs with references to this addendum
2. Update user-facing pricing documentation
3. Update investor deck if needed

---

## 11. Decision Record

**Decisions Made (January 25, 2026):**

1. ✅ **Adopt 4-tier pricing**: Individual ($15) / Team ($35) / Enterprise ($49) / Automation (Contact Sales)
2. ✅ **Remove deprecated tiers**: Power User, Enterprise Standard, Enterprise Premiere, OSS
3. ✅ **Switch to concurrent sessions**: Heartbeat-based, not device-count-based
4. ✅ **Keep trial frictionless**: Device-based (UUID), no signup, local enforcement
5. ✅ **Identity at payment**: Capture email at Stripe checkout, not before
6. ✅ **Agent detection via logging**: TOS + pattern analysis, not technical blocking
7. ✅ **Use KeyGen for session tracking**: Leverage machine heartbeat for concurrency

**Deferred Decisions:**

- OSS tier implementation (post-launch)
- Sophisticated agent farm detection (when we have data)
- User-identity licensing for Enterprise SSO (post-launch)

---

## 12. Approval

This addendum is approved for implementation. All referenced documents should be considered superseded with respect to pricing and licensing architecture.

**Approved by:** Simon Reiff, President & Technical Founder
**Date:** January 25, 2026

---

_This memorandum supersedes prior pricing specifications and establishes the authoritative pricing and licensing model for Mouse v1.0 launch._
