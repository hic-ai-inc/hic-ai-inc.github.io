# PLG Completion Plan v1

**Created:** 2026-01-29  
**Status:** 🟡 ACTIVE  
**Total Remaining Effort:** ~20-30 hours

---

## Executive Summary

PLG is **85-90% complete**. Two main workstreams remain:

1. **VS Code Extension** (8-12h) - Wire-up and publish
2. **Back-End Integration** (10-15h) - Stripe webhooks, portal data, E2E

---

## Workstream 1: VS Code Extension (hic/mouse-vscode)

**Current State:** VSIX v0.9.9 built, 139 tests passing

### Remaining Tasks

| #   | Task                                | Est.   | Priority | Notes                              |
| --- | ----------------------------------- | ------ | -------- | ---------------------------------- |
| 1.1 | Implement `Activate License` command | 2h     | HIGH     | Enter license key → call activate API |
| 1.2 | Wire live API endpoints             | 2-3h   | HIGH     | api.hic-ai.com/license/* routes    |
| 1.3 | Create VS Code Publisher account    | 1h     | HIGH     | marketplace.visualstudio.com       |
| 1.4 | Generate Personal Access Token      | 30min  | HIGH     | For vsce publish                   |
| 1.5 | Test sideload (final validation)    | 1h     | HIGH     | Verify license flow end-to-end     |
| 1.6 | Publish pre-release                 | 1h     | HIGH     | vsce publish --pre-release         |
| 1.7 | Marketing page update               | 1-2h   | MEDIUM   | Add extension installation link    |

**Subtotal:** 8-12h

### Prerequisites

- [x] Extension scaffold complete
- [x] MCP server integration complete
- [x] StatusBarManager complete
- [x] Licensing module complete (139 tests)
- [x] Heartbeat module complete
- [x] VSIX build working (mouse-0.9.9.vsix exists)
- [ ] Publisher account created
- [ ] PAT generated

---

## Workstream 2: Back-End Integration (hic-ai-inc.github.io)

**Current State:** Lambdas deployed, APIs partially wired

### Remaining Tasks

| #   | Task                                    | Est.   | Priority | Notes                                |
| --- | --------------------------------------- | ------ | -------- | ------------------------------------ |
| 2.1 | Create `/api/webhooks/stripe` route     | 2-3h   | HIGH     | Forward to plg-stream-processor      |
| 2.2 | Create `/api/webhooks/keygen` route     | 2h     | HIGH     | KeyGen license event webhooks        |
| 2.3 | Portal: Display license data            | 3-4h   | MEDIUM   | Show active licenses, usage, status  |
| 2.4 | Portal: Subscription management UI      | 2-3h   | MEDIUM   | Cancel/update subscription buttons   |
| 2.5 | E2E testing: Trial → Purchase flow      | 2-3h   | HIGH     | Full customer journey validation     |
| 2.6 | E2E testing: Concurrent session limits  | 1-2h   | MEDIUM   | Multiple machine enforcement         |

**Subtotal:** 12-18h (can be parallelized)

### Prerequisites

- [x] Lambdas deployed to staging (4 functions)
- [x] DynamoDB tables configured
- [x] Cognito authentication working
- [x] Stripe integration working
- [ ] KeyGen API keys in Secrets Manager

---

## Recommended Execution Order

### Sprint 1 (Day 1-2): VS Code Extension Publish

1. **Task 1.3** - Create VS Code Publisher account
2. **Task 1.4** - Generate PAT
3. **Task 1.1** - Implement `Activate License` command
4. **Task 1.2** - Wire live API endpoints
5. **Task 1.5** - Test sideload
6. **Task 1.6** - Publish pre-release

**Outcome:** Mouse available in VS Code Marketplace

### Sprint 2 (Day 2-3): Webhook Integration

1. **Task 2.1** - Create Stripe webhook route
2. **Task 2.2** - Create KeyGen webhook route
3. **Task 2.5** - E2E testing: Trial → Purchase

**Outcome:** Payment events flow through to Lambdas

### Sprint 3 (Day 3-4): Portal Polish

1. **Task 2.3** - Portal license data display
2. **Task 2.4** - Subscription management UI
3. **Task 2.6** - E2E testing: Concurrent sessions
4. **Task 1.7** - Marketing page update

**Outcome:** Complete user portal, marketing ready

---

## Risk Register

| Risk                           | Impact | Mitigation                           |
| ------------------------------ | ------ | ------------------------------------ |
| VS Code Publisher approval delay | MEDIUM | Submit early, have sideload fallback |
| API rate limits during testing | LOW    | Use test mode, mock endpoints        |
| KeyGen integration gaps        | MEDIUM | Test validation/activation flow early |

---

## Success Criteria

- [ ] Mouse extension published to VS Code Marketplace
- [ ] Trial → Purchase → License activation works end-to-end
- [ ] Concurrent session limits enforced
- [ ] Portal shows license status and management options
- [ ] Heartbeat keeps license valid during active use

---

## Files Modified This Session

### hic-ai-inc.github.io
- `docs/plg/PLG_ROADMAP_v4.md` - Updated VS Code Extension status (60-80h → 8-12h)
- `docs/plg/COMPLETION_PLAN_v1.md` - This file (new)

### hic (mouse-vscode) - Discovered
- `mouse-vscode/src/extension.js` - Main entry point
- `mouse-vscode/src/StatusBarManager.js` - Status bar UI
- `mouse-vscode/src/licensing/config.js` - API URLs, trial config
- `mouse-vscode/src/licensing/heartbeat.js` - Heartbeat manager
- `mouse-vscode/src/licensing/http-provider.js` - HTTPS client
- `mouse-vscode/src/licensing/license-checker.js` - Validation logic
- `mouse-vscode/src/licensing/license-state.js` - Local state
- `mouse-vscode/src/licensing/validation.js` - Response schemas
- `mouse-vscode/src/licensing/messages.js` - Agent-facing messages
- `mouse-vscode/mouse-0.9.9.vsix` - Built package

---

## Notes for Simon

The PLG Roadmap v4 significantly understated the VS Code Extension progress. The `hic/mouse-vscode` directory contains:

- Complete extension scaffold
- MCP server integration (McpRelayProvider)
- Full licensing implementation with 139 tests
- Heartbeat system
- Built VSIX v0.9.9

**Bottom line:** We're much closer to launch than the roadmap indicated. The remaining work is primarily:
1. A few hours of command wiring
2. Setting up publisher credentials
3. Actually publishing

The Lambda handlers we deployed today complete the back-end event processing. Next session should focus on:
1. Creating the VS Code Publisher account
2. Implementing the `Activate License` command
3. Publishing to marketplace

---

*Document generated: 2026-01-29T18:40 UTC*
