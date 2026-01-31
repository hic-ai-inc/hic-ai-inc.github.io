# PLG E2E Testing with Dev Containers

This directory contains a Dev Container configuration for testing the complete Mouse PLG flow from a **completely clean environment**.

## Why Dev Containers?

Testing on your local machine is compromised because:

- Mouse MCP server is already installed locally
- `~/.hic/license.json` may have existing state
- VS Code extensions persist across sessions

This Dev Container provides:

- ✅ Fresh Node.js 22.x environment
- ✅ No pre-installed Mouse extension
- ✅ No `~/.hic/` directory (clean license state)
- ✅ GitHub Copilot pre-installed for integration testing

## Prerequisites

1. **VS Code** with [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
2. **Docker Desktop** running
3. **Mouse VSIX file** in `~/source/repos/hic/mouse-vscode/` (e.g., `mouse-0.9.9.vsix`)

## Testing Flow

### Step 1: Open Dev Container

```bash
# From VS Code:
# 1. Open this folder: plg-website/__tests__/e2e/devcontainer/
# 2. Command Palette (Ctrl+Shift+P) → "Dev Containers: Reopen in Container"
# 3. Wait for container to build (~2-3 minutes first time)
```

### Step 2: Install Mouse VSIX

The VSIX is mounted at `/vsix/`. Install it:

1. Open Extensions panel (Ctrl+Shift+X)
2. Click "..." menu → "Install from VSIX..."
3. Navigate to `/vsix/` and select the Mouse VSIX file
4. Reload VS Code when prompted

### Step 3: Initialize Mouse Workspace

1. Command Palette → "Mouse: Initialize Workspace"
2. This creates `.vscode/mcp.json` with Mouse configuration
3. Reload window to start MCP server

### Step 4: Verify Trial Status

Ask Copilot to check license status:

```
@workspace Can you check the Mouse license status?
```

Expected: `status: "trial"` with 14 days remaining

### Step 5: Test Full PLG Flow

1. **Navigate to PLG website**: https://staging.hic-ai.com (or localhost:3000)
2. **Sign up with Google** - Cognito PostConfirmation trigger fires
3. **Check email** - SES should send verification
4. **Purchase license** (test mode)
5. **Copy license key**
6. **Activate in VS Code**: Command Palette → "Mouse: Activate License"
7. **Verify**: Ask Copilot to check license status again

Expected: `status: "licensed"`

## Troubleshooting

### VSIX not found

Place the Mouse VSIX file in `~/source/repos/hic/mouse-vscode/` on your **host machine**.

### Container won't start

```bash
docker system prune -f
# Then try reopening in container
```

### MCP server not starting

Check `.vscode/mcp.json` exists after "Initialize Workspace". If not, run the command again.

### License state persisting

The `postCreateCommand` should clear `~/.hic/`. If issues persist:

```bash
rm -rf ~/.hic
# Reload VS Code window
```

## Files

- `Dockerfile.plg-e2e` - Container image definition
- `devcontainer.json` - VS Code Dev Container configuration
- `README.md` - This file

## Related Documentation

- [PLG Email System Spec](../../../../docs/20260131_PLG_EMAIL_SYSTEM_TECHNICAL_SPECIFICATION_V5.md)
- [E2E Test Framework](../README.md)
