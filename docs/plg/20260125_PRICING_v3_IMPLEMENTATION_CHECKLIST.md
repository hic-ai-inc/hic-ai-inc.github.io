# Implementation Checklist: Pricing Model v3

**Date:** January 25, 2026
**Reference:** 20260125_ADDENDUM_PRICING_MODEL_v3_CONCURRENT_SESSIONS.md
**Status:** Ready for Implementation

---

## Quick Reference: New Pricing

| Tier       | Price         | Sessions      | Target         |
| ---------- | ------------- | ------------- | -------------- |
| Individual | $15/mo        | 2 concurrent  | PLG self-serve |
| Team       | $35/mo        | 5 concurrent  | Default B2B    |
| Enterprise | $49/mo        | 10 concurrent | SSO/SCIM       |
| Automation | Contact Sales | Per agent     | CI/Agent farms |

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
⬜ mouse_enterprise_monthly    $49/month   metadata: {tier: "enterprise", maxConcurrent: 10}
⬜ mouse_enterprise_annual     $490/year   metadata: {tier: "enterprise", maxConcurrent: 10}
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
⬜ policy_enterprise   maxMachines: 10, heartbeatDuration: 900 (15 min)
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

- [ ] Individual: 3rd session blocked
- [ ] Team: 7th session blocked
- [ ] Enterprise: 51st session logged (soft limit)
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
5. **Enterprise price is $49** (competitive with Copilot Enterprise $39)
6. **Team tier is default B2B** (not "Enterprise Standard")

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

_This checklist tracks implementation of the Pricing Model v3 addendum._
