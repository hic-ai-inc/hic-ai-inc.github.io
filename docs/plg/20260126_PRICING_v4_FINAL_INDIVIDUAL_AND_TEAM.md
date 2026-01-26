# Implementation Checklist: Pricing Model v4 — Individual + Team Only

**Date:** January 26, 2026  
**Supersedes:** 20260125_PRICING_v3_IMPLEMENTATION_CHECKLIST.md  
**Status:** ✅ APPROVED — FINAL FOR LAUNCH

---

## Change from v3: Enterprise Tier Removed

**Decision:** Enterprise tier ($49/mo with SSO/SCIM) is **deferred to post-launch**.

**Rationale:**
- SSO/SAML integration requires significant Auth0 configuration and testing
- SCIM provisioning adds complexity we don't need for launch
- Focus on proving PLG model with Individual + Team first
- Enterprise features can be added once we have B2B traction

**Impact:**
- 2-tier model simplifies implementation
- Team tier becomes the "top" tier for now
- Enterprise prospects can contact sales for custom arrangements

---

## Quick Reference: Final Pricing (v4)

| Tier       | Price   | Sessions     | Annual    | Target                |
| ---------- | ------- | ------------ | --------- | --------------------- |
| Individual | $15/mo  | 2 concurrent | $150/year | PLG self-serve        |
| Team       | $35/mo  | 5 concurrent | $350/year | Default B2B, managers |

> **Note:** Enterprise tier (SSO/SCIM, $49/mo) deferred to post-launch. Contact sales for custom arrangements.

---

## Files to Update

### 🔴 HIGH PRIORITY: Mouse Extension (hic repo)

| File                                             | Status  | Changes                                        |
| ------------------------------------------------ | ------- | ---------------------------------------------- |
| `mouse/src/licensing/constants.js`               | ⬜ TODO | Remove LS URLs, add HIC API URLs, update tiers |
| `mouse/src/licensing/providers/http-provider.js` | ⬜ TODO | JSON format, add heartbeat method              |
| `mouse/src/licensing/license-checker.js`         | ⬜ TODO | Add heartbeat loop (5 min interval)            |
| `mouse/src/licensing/license-state.js`           | ⬜ TODO | Store sessionId, remove instanceId references  |

### 🔴 HIGH PRIORITY: Website Backend (hic-ai-inc.github.io repo)

| File                                                 | Status  | Changes                                       |
| ---------------------------------------------------- | ------- | --------------------------------------------- |
| `plg-website/src/lib/constants.js`                   | ⬜ TODO | Update PRICING object, STRIPE_PRICES          |
| `plg-website/src/app/api/license/heartbeat/route.js` | ⬜ TODO | **NEW FILE**                                  |
| `plg-website/src/app/api/license/activate/route.js`  | ⬜ TODO | Add session creation, return concurrency info |
| `plg-website/src/app/api/license/validate/route.js`  | ⬜ TODO | Update response format                        |
| `plg-website/src/lib/keygen.js`                      | ⬜ TODO | Add heartbeat function, session management    |
| `plg-website/src/lib/dynamodb.js`                    | ⬜ TODO | Add session entity functions                  |

### 🟡 MEDIUM PRIORITY: Frontend

| File                                              | Status  | Changes                |
| ------------------------------------------------- | ------- | ---------------------- |
| `plg-website/src/app/(marketing)/pricing/page.js` | ⬜ TODO | Update to 4-tier UI    |
| `plg-website/src/app/checkout/*/page.js`          | ⬜ TODO | Update tier references |

### 🟢 LOW PRIORITY: Documentation

| File                                                                      | Status  | Changes                        |
| ------------------------------------------------------------------------- | ------- | ------------------------------ |
| `docs/plg/20260122_GC_PLG_TECHNICAL_SPECIFICATION_v2.md`                  | ⬜ TODO | Add supersession notice at top |
| `docs/plg/20260122_GC_PROPOSED_PRICING_CHANGES_FOR_PLG_IMPLEMENTATION.md` | ⬜ TODO | Add supersession notice        |
| `docs/20260124_MOUSE_LICENSING_TRIAL_IMPLEMENTATION_PLAN.md`              | ⬜ TODO | Add supersession notice        |
| `docs/plg/PLG_ROADMAP_v2.md`                                              | ⬜ TODO | Update Stripe products section |

---

## External Services Configuration

### Stripe Products (Create)

```
⬜ mouse_individual_monthly    $15/month   metadata: {tier: "individual", maxConcurrent: 2}
⬜ mouse_individual_annual     $150/year   metadata: {tier: "individual", maxConcurrent: 2}
⬜ mouse_team_monthly          $35/month   metadata: {tier: "team", maxConcurrent: 5}
⬜ mouse_team_annual           $350/year   metadata: {tier: "team", maxConcurrent: 5}
```

### Stripe Products (Delete/Archive)

```
⬜ Archive: mouse_power_user_*
⬜ Archive: mouse_enterprise_standard_*
⬜ Archive: mouse_enterprise_premiere_*
⬜ Archive: mouse_oss_*
```

### KeyGen Policies (Create)

```
⬜ policy_individual   maxMachines: 2,  heartbeatDuration: 900 (15 min)
⬜ policy_team         maxMachines: 5,  heartbeatDuration: 900 (15 min)
```

### KeyGen Policies (Delete/Archive)

```
⬜ Archive: policy_power_user
⬜ Archive: policy_enterprise_standard
⬜ Archive: policy_enterprise_premiere
⬜ Archive: policy_oss
```

---

## Testing Checklist

### Trial Flow (No Changes Expected)

- [ ] Fresh install starts 14-day trial
- [ ] Trial works offline
- [ ] 2 device limit enforced locally
- [ ] Trial expires after 14 days
- [ ] Expired trial blocks all tools

### Licensed Flow (New Behavior)

- [ ] License activation creates session
- [ ] Heartbeat updates lastSeen
- [ ] Concurrent limit enforced server-side
- [ ] Session expires after 15 min no heartbeat
- [ ] New session auto-clears expired sessions
- [ ] Closing VS Code doesn't require explicit deactivation
- [ ] Containers don't burn permanent device slots

### Concurrency Enforcement

- [ ] Individual: 3rd session blocked (limit is 2)
- [ ] Team: 6th session blocked (limit is 5)
- [ ] Blocked user sees clear upgrade message

### Offline Behavior

- [ ] Licensed user with cached state works offline for 7 days
- [ ] After 7 days offline, requires network validation
- [ ] Heartbeat failures don't immediately block (grace)

---

## Key Decisions Documented

1. **Trial remains device-based** (no signup friction)
2. **Licensed uses heartbeat** (session concurrency)
3. **Containers are non-issues** (sessions auto-expire)
4. **Agent detection is TOS + logging** (not technical blocking)
5. **Enterprise tier deferred** (SSO/SCIM post-launch)
6. **Team tier is top tier for launch** ($35/mo, 5 concurrent sessions)

---

## Rollback Plan

If concurrent session model causes issues:

1. Revert `http-provider.js` to device-activation model
2. Disable heartbeat endpoint
3. Fall back to KeyGen device limits (permanent)
4. Pricing changes can remain (separate concern)

---

## Success Criteria

- [ ] E2E test: Install → Trial → Purchase → Activate → Heartbeat → Close → Reopen
- [ ] Concurrency test: Open on 3+ devices with Individual license → 3rd blocked
- [ ] Container test: Open in devcontainer → close → no device slot burned
- [ ] Offline test: Disconnect network → continue working for 7 days
- [ ] Upgrade test: Individual → Team → session limit increases

---

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| v4 | Jan 26, 2026 | Remove Enterprise tier, 2-tier launch model |
| v3 | Jan 25, 2026 | Added Enterprise with SSO/SCIM |

_This is the definitive pricing document for Mouse PLG launch._
