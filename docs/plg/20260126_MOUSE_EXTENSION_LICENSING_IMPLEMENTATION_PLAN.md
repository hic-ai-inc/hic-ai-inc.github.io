# Mouse VS Code Extension & Licensing Implementation Plan

**Date:** January 26, 2026  
**Author:** GitHub Copilot  
**Status:** Ready for Implementation  
**Repositories:** `hic-ai-inc/hic` (Mouse), `hic-ai-inc/hic-ai-inc.github.io` (Website/Backend)

---

## Executive Summary

Mouse is a **fully functional MCP server** already in production use. What remains is:

1. **VS Code Extension Wrapper** — Package Mouse as a one-click installable extension
2. **Licensing Integration** — Connect to the HIC API for license validation
3. **Trial/Nag System** — Implement the agent-facing license messaging

The backend infrastructure (KeyGen.sh, Stripe, DynamoDB, SES) is **already complete** in the website repo. This is primarily a client-side integration task.

---

## What Already Exists ✅

### In `hic-ai-inc/hic` (Mouse Repo)

| Component | Status | Location |
|-----------|--------|----------|
| **MCP Server** | ✅ Production-ready | `mouse/src/` |
| **All Mouse Tools** | ✅ Working | `mouse/src/tools/` |
| **NPX Distribution** | ✅ Working | `npx @hic-ai-inc/mouse` |
| **E2E Tests** | ✅ Passing | `mouse/__tests__/` |
| **Packaging Scripts** | ✅ Exist | `packaging/` |

### In `hic-ai-inc/hic-ai-inc.github.io` (Website Repo)

| Component | Status | Location |
|-----------|--------|----------|
| **KeyGen.sh Client** | ✅ Complete (359 lines) | `plg-website/src/lib/keygen.js` |
| **`machineHeartbeat()` function** | ✅ Implemented | `plg-website/src/lib/keygen.js#L299` |
| **License Validation API** | ✅ Complete | `plg-website/src/app/api/license/validate/route.js` |
| **License Activation API** | ✅ Complete | `plg-website/src/app/api/license/activate/route.js` |
| **Webhook Handlers** | ✅ Complete | `plg-website/src/app/api/webhooks/keygen/route.js` |
| **DynamoDB Device Tracking** | ✅ Complete | `plg-website/src/lib/dynamodb.js` |
| **SES Email Templates** | ✅ Complete (893 lines) | `plg-website/src/lib/ses.js` |

---

## What Needs to Be Built

### Phase 1: VS Code Extension Scaffold (4-6h)

Create the extension wrapper that hosts the existing MCP server.

| Task | Est. | Notes |
|------|------|-------|
| Create `mouse-vscode/package.json` | 1h | VS Code manifest with `engines.vscode`, `activationEvents` |
| Create `extension.js` entry point | 2h | Activate/deactivate lifecycle |
| Create `StatusBarManager` class | 1h | Show Mouse status in VS Code |
| Test in Extension Development Host | 1h | F5 debugging |

**Key Insight:** We're not building Mouse from scratch — we're wrapping the existing `mouse/src/` code in a VS Code extension shell.

### Phase 2: MCP Server Integration (4-6h)

Connect the extension to the existing MCP server.

| Task | Est. | Notes |
|------|------|-------|
| Create `McpServerManager` class | 2h | Spawn/manage server process |
| Bundle MCP server with extension | 2h | Webpack/esbuild config |
| Wire status bar to server state | 1h | Running/stopped/error indicators |
| Test MCP communication | 1h | Verify tools work through extension |

**Key Insight:** The MCP server already works via `npx`. We just need to embed it.

### Phase 3: Licensing Client (6-8h)

Create the client-side licensing that calls our existing backend APIs.

| Task | Est. | Notes |
|------|------|-------|
| Create `licensing/config.js` | 0.5h | URLs, intervals, trial duration |
| Create `licensing/license-state.js` | 1.5h | Local state in `~/.hic/license.json` |
| Create `licensing/license-checker.js` | 2h | Main validation logic |
| Create `licensing/http-provider.js` | 2h | Call `api.hic-ai.com/api/license/*` |
| Wire to extension activation | 1h | Check license on startup |
| Test license validation flow | 1h | Mock + real API |

**Key Insight:** The backend APIs already exist and are tested. This is just the HTTP client.

### Phase 4: Heartbeat Client (3-4h)

Implement the 5-minute heartbeat for concurrent session tracking.

| Task | Est. | Notes |
|------|------|-------|
| Add heartbeat loop to license-checker | 1.5h | setInterval, 5-min default |
| Store sessionId for tracking | 0.5h | UUID generated on activation |
| Handle heartbeat failures gracefully | 1h | Don't block on network errors |
| Test concurrent session enforcement | 1h | Two machines, one license |

**Key Insight:** `machineHeartbeat()` already exists server-side. Client just needs to call it.

### Phase 5: Nag Banner System (4-6h)

Implement agent-facing license messaging via `_meta.license`.

| Task | Est. | Notes |
|------|------|-------|
| Create `licensing/messages.js` | 1h | Message templates per state |
| Implement `_meta.license` injection | 2h | Add to MCP tool responses |
| Implement frequency algorithm | 1h | 20% → 50% → 100% escalation |
| Implement tool blocking for expired | 1h | Return error, not result |
| Test nag frequency | 1h | Verify escalation works |

**States to Handle:**
- `TRIAL` (days 1-7): 20% of calls include reminder
- `TRIAL_ENDING` (days 8-12): 50% of calls
- `TRIAL_LAST_DAY` (day 13-14): Every call
- `LICENSED`: No messages
- `EXPIRED`: Block tools, return error
- `SUSPENDED` (payment failed): Grace period message

### Phase 6: VSIX Packaging (2-3h)

Package and publish to VS Code Marketplace.

| Task | Est. | Notes |
|------|------|-------|
| Create VS Code Publisher account | 0.5h | marketplace.visualstudio.com |
| Generate Personal Access Token | 0.25h | For `vsce publish` |
| Run `vsce package` | 0.5h | Creates `.vsix` file |
| Test sideload installation | 0.5h | Install from VSIX |
| Submit for review | 0.25h | Marketplace submission |
| Publish pre-release | 0.5h | `--pre-release` flag |

### Phase 7: Integration Testing (4-6h)

End-to-end testing of the complete flow.

| Task | Est. | Notes |
|------|------|-------|
| Test fresh install → trial starts | 0.5h | — |
| Test trial countdown | 0.5h | Mock time advancement |
| Test trial expiration → block | 0.5h | — |
| Test license key entry | 0.5h | — |
| Test license validation | 0.5h | — |
| Test concurrent sessions | 1h | Two machines |
| Test heartbeat timeout | 0.5h | Session expiry |
| Test offline mode | 0.5h | Cached validation |
| Test payment failure → grace | 0.5h | Suspended state |

---

## Realistic Timeline

| Phase | Description | Est. Hours | Cumulative |
|-------|-------------|------------|------------|
| 1 | Extension Scaffold | 4-6h | 4-6h |
| 2 | MCP Integration | 4-6h | 8-12h |
| 3 | Licensing Client | 6-8h | 14-20h |
| 4 | Heartbeat Client | 3-4h | 17-24h |
| 5 | Nag Banner System | 4-6h | 21-30h |
| 6 | VSIX Packaging | 2-3h | 23-33h |
| 7 | Integration Testing | 4-6h | **27-39h** |

**Total Estimate: 27-39 hours** (not 80-100h as previously stated)

This is achievable in **4-5 focused days** of development.

---

## API Endpoints (Already Built)

The Mouse extension will call these existing endpoints:

```
POST /api/license/validate
  Request:  { "licenseKey": "XXXX-XXXX", "machineId": "uuid", "fingerprint": "..." }
  Response: { "valid": true, "license": { "status": "active", "maxMachines": 3 }}

POST /api/license/activate
  Request:  { "licenseKey": "XXXX-XXXX", "machineId": "uuid", "name": "Simon's MacBook" }
  Response: { "success": true, "machine": { "id": "mach_xxx" }}

POST /api/license/deactivate
  Request:  { "licenseKey": "XXXX-XXXX", "machineId": "uuid" }
  Response: { "success": true }

POST /api/license/heartbeat (or inline with validate)
  Request:  { "machineId": "mach_xxx" }
  Response: { "success": true }
```

---

## Key Files to Create

```
mouse-vscode/
├── package.json           # VS Code extension manifest
├── extension.js           # Entry point (activate/deactivate)
├── webpack.config.js      # Bundle MCP server
├── src/
│   ├── McpServerManager.js
│   ├── StatusBarManager.js
│   └── licensing/
│       ├── config.js
│       ├── license-state.js
│       ├── license-checker.js
│       ├── http-provider.js
│       └── messages.js
└── __tests__/
    └── licensing/
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Marketplace approval delay | Have GitHub Packages / NPX as backup |
| Bundling complexity | Start with simple esbuild, upgrade if needed |
| License state corruption | Validate JSON on load, reset if invalid |
| Network failures | Cache license state, generous offline window |

---

## Next Steps

1. **Create `mouse-vscode/` directory** in hic repo
2. **Scaffold `package.json`** with VS Code manifest
3. **Create minimal `extension.js`** that logs activation
4. **Test F5 debugging** in Extension Development Host
5. **Iterate from there**

The foundation is solid. This is integration work, not greenfield development.
