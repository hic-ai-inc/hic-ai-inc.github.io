# Feasibility Report: Integrating CLI Functionality with VSIX Extension

**Date:** February 16, 2026
**Author:** AI Analysis (Copilot), commissioned by SWR
**Status:** Pre-Launch Reference — CLI Deferred to Post-Launch
**Version:** 1.0

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State of CLI Infrastructure](#2-current-state-of-cli-infrastructure)
   - 2.1 [Package Identity and Structure](#21-package-identity-and-structure)
   - 2.2 [Command Inventory](#22-command-inventory)
   - 2.3 [Shared Command Layer](#23-shared-command-layer)
   - 2.4 [Multi-Client Configuration Engine](#24-multi-client-configuration-engine)
   - 2.5 [Test Coverage](#25-test-coverage)
3. [Distribution Path Analysis](#3-distribution-path-analysis)
   - 3.1 [npm Public — Ruled Out](#31-npm-public--ruled-out)
   - 3.2 [npm Private (GitHub Packages / npm Org)](#32-npm-private-github-packages--npm-org)
   - 3.3 [Node.js Single Executable Application (SEA)](#33-nodejs-single-executable-application-sea)
   - 3.4 [Gated Download from hic-ai.com](#34-gated-download-from-hic-aicom)
   - 3.5 [Bundle CLI Inside VSIX](#35-bundle-cli-inside-vsix)
   - 3.6 [Skip CLI for Launch](#36-skip-cli-for-launch)
4. [VS Code Command ↔ CLI Parity Analysis](#4-vs-code-command--cli-parity-analysis)
5. [IP Protection Assessment](#5-ip-protection-assessment)
6. [Post-Launch Use Cases](#6-post-launch-use-cases)
   - 6.1 [Automated Playbooks via GitHub Actions](#61-automated-playbooks-via-github-actions)
   - 6.2 [Copilot Coding Agent with MCP Integration](#62-copilot-coding-agent-with-mcp-integration)
   - 6.3 [Containerized Async Background Workflows](#63-containerized-async-background-workflows)
   - 6.4 [IDE Platform Extensions (JetBrains, Visual Studio)](#64-ide-platform-extensions-jetbrains-visual-studio)
   - 6.5 [Enterprise Fleet Provisioning](#65-enterprise-fleet-provisioning)
7. [Recommended Architecture for Post-Launch CLI](#7-recommended-architecture-for-post-launch-cli)
   - 7.1 [Phase 1: SEA Binary Distribution](#71-phase-1-sea-binary-distribution)
   - 7.2 [Phase 2: Gated Download Integration](#72-phase-2-gated-download-integration)
   - 7.3 [Phase 3: Container-Native Distribution](#73-phase-3-container-native-distribution)
8. [Pre-Launch Decision](#8-pre-launch-decision)
9. [Appendix A: File Inventory](#appendix-a-file-inventory)
10. [Appendix B: Command Reference](#appendix-b-command-reference)

---

## 1. Executive Summary

HIC already has a **fully functional CLI** at `packaging/cli/` — package name `@get-hic/mouse-cli` v0.10.10, with two binary entry points (`hic` for management, `hic-mouse` for PLG installation), license management, multi-client MCP configuration (9 clients), diagnostics, and a shared command layer with the VS Code extension. The CLI is not a prototype; it is production-grade infrastructure with tests and documentation.

However, **the only low-effort distribution path (npm public) is ruled out** because it makes source code browsable on npmjs.com, unpkg.com, and jsdelivr with zero friction — incompatible with HIC's IP protection requirements. Every alternative distribution path that preserves IP protection adds 3-12 hours of effort that competes with critical Track A and Track B pre-launch priorities.

**Recommendation:** Ship VSIX only for launch. Defer CLI to post-launch, where it becomes the foundation for containerized async agent workflows, automated playbooks, and enterprise fleet provisioning. When the time comes, the Node.js Single Executable Application (SEA) path provides the best combination of IP protection and distribution simplicity.

The existing CLI code is **not wasted** — it is excellent infrastructure that will be directly reused. The shared command layer (`licensing/commands/`) was explicitly designed for dual-use and already exports `formatXxxForCLI()` functions for all license operations.

---

## 2. Current State of CLI Infrastructure

### 2.1 Package Identity and Structure

| Property                | Value                                                  |
| ----------------------- | ------------------------------------------------------ |
| **Package name**        | `@get-hic/mouse-cli`                                   |
| **Version**             | 0.10.10                                                |
| **License**             | UNLICENSED (proprietary)                               |
| **Module type**         | ES Module (`"type": "module"`)                         |
| **Node.js requirement** | ≥18.0.0                                                |
| **Location**            | `packaging/cli/`                                       |
| **Binary entry points** | `hic` → `bin/hic.js`, `hic-mouse` → `bin/hic-mouse.js` |
| **Published**           | No (configured for npm public — needs reconfiguration) |

Current `publishConfig` in `package.json`:

```json
"publishConfig": {
  "registry": "https://registry.npmjs.org",
  "access": "public"
}
```

This **must be changed** before any future publication to avoid accidental public exposure.

### 2.2 Command Inventory

The CLI implements two distinct command hierarchies:

**`hic` — Unified Management CLI:**

```
hic mouse license status          # Show license status
hic mouse license activate <key>  # Activate a license key
hic mouse license deactivate      # Deactivate from this device
hic mouse license info            # Detailed license info
hic mouse config show             # Show MCP configuration status
hic mouse config clients          # List available MCP clients
hic mouse config add <client>     # Add an MCP client
hic mouse config remove <client>  # Remove an MCP client
hic mouse config init             # Initialize all detected clients
hic mouse doctor                  # Installation health diagnostics
hic mouse version                 # Show Mouse version
```

**`hic-mouse` — PLG Installer (single-command flow):**

```
npx @get-hic/mouse --token=<token>            # Install with token
npx @get-hic/mouse --token-file=~/.hic-token  # Token from file
HIC_TOKEN=xxx npx @get-hic/mouse              # Token from env
npx @get-hic/mouse --token=xxx --client=copilot --client=cline  # Specific clients
npx @get-hic/mouse --token=xxx --interactive   # Interactive picker
npx @get-hic/mouse --token=xxx --yes           # Auto-confirm (CI/automation)
```

**CLI Module Architecture:**

```
packaging/cli/
├── bin/
│   ├── hic.js              # Main entry: routes to product handlers
│   ├── hic-mouse.js        # PLG installer entry
│   ├── mouse.js            # Routes: license, config, doctor
│   ├── mouse-license.js    # License subcommands (uses shared commands)
│   ├── mouse-config.js     # Config subcommands (uses configure-clients)
│   └── mouse-doctor.js     # 396 lines of diagnostics checks
├── src/
│   ├── index.js            # PLG installer orchestration (310 lines)
│   ├── args.js             # Argument parsing
│   ├── configure.js        # VS Code configuration
│   ├── configure-clients.js # Multi-client MCP config (577 lines, 9 clients)
│   ├── errors.js           # CLI error types and exit codes
│   ├── install.js          # Package installation
│   └── token.js            # Token validation and generation
├── tests/
│   ├── args.test.js
│   ├── configure-clients.test.js
│   └── install.test.js
├── scripts/
├── package.json
└── README.md
```

### 2.3 Shared Command Layer

The `licensing/commands/` module was explicitly designed for dual-use between the VS Code extension and the CLI:

```javascript
// licensing/commands/index.js — Exports both business logic AND CLI formatters
export { getStatus, formatStatusForCLI } from "./status.js";
export { activate, formatActivateForCLI } from "./activate.js";
export { deactivate, formatDeactivateForCLI } from "./deactivate.js";
export { getInfo, formatInfoForCLI } from "./info.js";
export {
  validate,
  shouldRevalidate,
  isWithinOfflineGrace,
  maskLicenseKey,
  formatValidateForCLI,
} from "./validate.js";
```

Each module exports:

- **Business logic function** — used by both extension and CLI
- **`formatXxxForCLI()` function** — CLI-specific output formatting with `--json` support

This is a well-designed pattern. The CLI's `mouse-license.js` imports directly from this shared layer:

```javascript
import {
  getStatus,
  formatStatusForCLI,
  activate,
  formatActivateForCLI,
  deactivate,
  formatDeactivateForCLI,
  getInfo,
  formatInfoForCLI,
} from "../../../licensing/commands/index.js";
```

### 2.4 Multi-Client Configuration Engine

The CLI includes a sophisticated multi-client MCP configuration engine (`configure-clients.js`, 577 lines) supporting 9 MCP clients:

| Client         | Location Type   | Config Path                     |
| -------------- | --------------- | ------------------------------- |
| GitHub Copilot | workspace-local | `.vscode/mcp.json`              |
| Claude Code    | workspace-local | `.mcp.json`                     |
| Kilo Code      | workspace-local | `.kilocode/mcp.json`            |
| Cursor         | workspace-local | `.cursor/mcp.json`              |
| Kiro           | workspace-local | `.kiro/settings/mcp.json`       |
| Continue       | workspace-local | `.continue/mcpServers/hic.json` |
| Cline          | global          | `cline_mcp_settings.json`       |
| Roo Code       | global          | `cline_mcp_settings.json`       |
| CodeGPT        | global          | `~/.codegpt/mcp_config.json`    |

This imports from `mouse/src/config/index.js` (shared single source of truth), making the CLI configuration functionally identical to what the extension produces.

### 2.5 Test Coverage

Three test files exist:

- `tests/install.test.js` — Registry configuration, .npmrc content, npm install commands, error codes, cleanup, token validation
- `tests/configure-clients.test.js` — Multi-client configuration
- `tests/args.test.js` — Argument parsing

Tests use HIC's `dm/facade/test-helpers/` (Jest-like API with `node:test`).

### 2.6 Release Integration

The release script (`scripts/release-mouse.sh`) already includes npm publishing as Step 2, with a `--skip-npm` flag (noted as "deprecated channel"). The script builds the VSIX and can optionally build/publish the npm package in the same release cycle.

---

## 3. Distribution Path Analysis

### 3.1 npm Public — Ruled Out

| Aspect              | Assessment                                                    |
| ------------------- | ------------------------------------------------------------- |
| **Effort**          | 2-4 hours (minimal — already configured)                      |
| **IP Protection**   | **None** — source browsable on npmjs.com, unpkg.com, jsdelivr |
| **User Experience** | Excellent — `npx @get-hic/mouse --token=xxx`                  |
| **Decision**        | **REJECTED**                                                  |

**Rationale:** Publishing to npm public makes all source code freely browsable and downloadable without any license acceptance or installation action. This fundamentally differs from the VSIX model, where users must install the software through the Marketplace (implying acceptance of the license terms) and would need to deliberately extract and reverse-engineer the .vsix archive to inspect the source. The npm public path provides zero friction inspection of IP against an explicit agreement not to reverse-engineer.

**NOTE — Immediate Action Required:** The current `publishConfig` in `packaging/cli/package.json` is set to `"access": "public"`. This must be changed to prevent accidental publication. Recommended change:

```json
"publishConfig": {
  "registry": "https://registry.npmjs.org",
  "access": "restricted"
}
```

Or remove `publishConfig` entirely until a private distribution path is chosen.

### 3.2 npm Private (GitHub Packages / npm Org)

| Aspect              | Assessment                                      |
| ------------------- | ----------------------------------------------- |
| **Effort**          | 3-5 hours                                       |
| **IP Protection**   | Good — requires auth token to access            |
| **User Experience** | Poor — customers need `.npmrc` with auth tokens |
| **Decision**        | Not recommended for PLG / end-user distribution |

Could work for enterprise fleet provisioning where IT manages `.npmrc` configuration, but unacceptable friction for PLG self-serve installation. Customers encountering `E401 Unauthorized` before they even start is the anti-pattern of PLG.

### 3.3 Node.js Single Executable Application (SEA)

| Aspect              | Assessment                                                     |
| ------------------- | -------------------------------------------------------------- |
| **Effort**          | 6-10 hours (initial), 2-4 hours per release cycle              |
| **IP Protection**   | **Strong** — compiled to native binary, source not inspectable |
| **User Experience** | Excellent — download and run a single binary                   |
| **Decision**        | **RECOMMENDED for post-launch**                                |

Node.js SEA (available since Node.js 20) compiles a Node.js application into a single executable binary that includes the Node.js runtime. The source code is embedded as a blob, not directly readable.

**How it works:**

1. Prepare a SEA configuration JSON pointing to the entry script
2. Generate a blob: `node --experimental-sea-config sea-config.json`
3. Copy the Node.js binary and inject the blob: `npx postject <binary> NODE_SEA_BLOB sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`
4. The result is a self-contained executable (~40-60MB depending on platform)

**Advantages:**

- Source code not casually browsable (embedded in V8 snapshot)
- No Node.js installation required on the target machine
- Single binary per platform (linux-x64, darwin-arm64, win-x64)
- Clean container integration — just copy the binary
- Exit codes and stdout work naturally for automation

**Disadvantages:**

- Per-platform build required (cross-compilation possible via CI matrix)
- ~40-60MB binary size (acceptable for the value delivered)
- Still technically reversible with significant effort (V8 snapshot analysis), but the barrier is substantially higher than browsing npm
- Relatively new feature — API may evolve across Node.js major versions

**Effort Breakdown:**

- SEA build script: 2-3 hours
- CI matrix for 3 platforms: 2-3 hours
- Code signing (optional but recommended): 2-4 hours
- Release integration: 1-2 hours

### 3.4 Gated Download from hic-ai.com

| Aspect              | Assessment                                    |
| ------------------- | --------------------------------------------- |
| **Effort**          | 8-12 hours                                    |
| **IP Protection**   | **Strong** — license key required to download |
| **User Experience** | Good — visit site, enter key, download binary |
| **Decision**        | Good complement to SEA for post-launch        |

Would require:

- Download API endpoint (Lambda + S3 presigned URLs)
- License key validation at download time
- Platform detection and binary serving
- Download tracking and analytics
- Integration with existing Keygen/Stripe infrastructure

Best implemented as a layer on top of SEA binaries — the gated download serves the same compiled binary that could also be cached in a container image.

### 3.5 Bundle CLI Inside VSIX

| Aspect              | Assessment                                                    |
| ------------------- | ------------------------------------------------------------- |
| **Effort**          | 2-3 hours                                                     |
| **IP Protection**   | Same as VSIX extension                                        |
| **User Experience** | Depends — users would discover CLI after installing extension |
| **Decision**        | Considered; useful for extension-integrated `hic` commands    |

The VSIX could include a `bin/` directory so that after installation, users could run CLI commands from the integrated terminal. This wouldn't solve the standalone distribution problem but could enhance the extension experience.

### 3.6 Skip CLI for Launch

| Aspect              | Assessment                         |
| ------------------- | ---------------------------------- |
| **Effort**          | 0 hours                            |
| **IP Protection**   | N/A — VSIX only                    |
| **User Experience** | Standard — install via Marketplace |
| **Decision**        | **RECOMMENDED for launch**         |

**Rationale:** The value proposition of the CLI path was "alternative distribution if Marketplace is slow or unavailable." But the easy version (npm public) is off the table, and every protected alternative adds 6-12 hours of effort that competes directly with Track A (LS approval, payment integration, content) and Track B (auto-update, security audit, production hardening) priorities. VSIX via VS Code Marketplace and/or Open VSX is the path of least resistance with adequate IP protection.

---

## 4. VS Code Command ↔ CLI Parity Analysis

| Capability               | VS Code Extension           | CLI (`hic`)                         | Gap            |
| ------------------------ | --------------------------- | ----------------------------------- | -------------- |
| License status           | `mouse.showStatus`          | `hic mouse license status`          | ✅ Parity      |
| License activation       | `mouse.enterLicenseKey`     | `hic mouse license activate <key>`  | ✅ Parity      |
| License info             | `mouse.viewLicenseStatus`   | `hic mouse license info`            | ✅ Parity      |
| License deactivation     | —                           | `hic mouse license deactivate`      | CLI only       |
| Initialize workspace     | `mouse.initializeWorkspace` | `hic mouse config init`             | ✅ Parity      |
| Remove from workspace    | `mouse.removeFromWorkspace` | `hic mouse config remove <client>`  | ✅ Parity      |
| Check for updates        | `mouse.checkForUpdates`     | —                                   | Extension only |
| Show update info         | `mouse.showUpdateInfo`      | —                                   | Extension only |
| Installation diagnostics | —                           | `hic mouse doctor`                  | CLI only       |
| Multi-client config      | —                           | `hic mouse config add/show/clients` | CLI only       |
| PLG installer flow       | —                           | `hic-mouse --token=xxx`             | CLI only       |

**Analysis:** The shared `licensing/commands/` layer ensures core license operations are identical. The CLI has capabilities the extension lacks (deactivate, doctor, multi-client config), and the extension has capabilities the CLI lacks (update management). This is appropriate — update management makes sense in a GUI; diagnostics and multi-client setup make sense on the command line.

---

## 5. IP Protection Assessment

| Distribution Path | Casual Inspection           | Deliberate Extraction       | License Acceptance     |
| ----------------- | --------------------------- | --------------------------- | ---------------------- |
| npm public        | **Trivial** — browse online | N/A — already public        | None required          |
| VSIX Marketplace  | Impossible without install  | Moderate — unzip .vsix      | Implicit at install    |
| npm private       | Impossible without token    | Token holder can extract    | Through token issuance |
| SEA binary        | Impossible                  | Hard — V8 snapshot analysis | Through key validation |
| Gated download    | Impossible without key      | Hard — V8 snapshot + key    | Explicit at download   |

The VSIX model already provides reasonable protection: users must install via Marketplace (accepting terms), and extraction requires deliberate action against the license agreement. SEA binaries provide the strongest protection of any distribution path and are the right choice for automation-focused distribution where there's no Marketplace to gate access.

---

## 6. Post-Launch Use Cases

The CLI becomes strategically important post-launch for use cases where a VS Code extension cannot operate or is impractical.

### 6.1 Automated Playbooks via GitHub Actions

**Use Case:** A coding agent (or human) demonstrates a complex edit on 2 files. Instead of repeating the task manually for the remaining 31 files, the agent dispatches a prompt to a back-end GitHub Actions workflow that performs the repetitive work asynchronously.

**Why CLI matters:** GitHub Actions runners don't have VS Code installed. A CLI binary (SEA) can:

- Activate a Mouse license on the runner
- Configure MCP for the agent's use
- Provide `hic mouse doctor` for pre-flight checks
- Run Mouse tools directly via Node.js process within the container

**Architecture:**

```
Agent in VS Code ──► GitHub API (dispatch workflow)
                          │
                          ▼
              GitHub Actions Runner (container)
                          │
                          ├── Download Mouse SEA binary
                          ├── hic mouse license activate $KEY
                          ├── hic mouse config init --yes
                          ├── Agent (Copilot Coding Agent) uses Mouse MCP
                          ├── PR created with changes
                          │
                          ▼
              Agent in VS Code ◄── PR notification (async return)
```

### 6.2 Copilot Coding Agent with MCP Integration

**Use Case:** GitHub's Copilot coding agent (https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/extend-coding-agent-with-mcp) runs in a Copilot-managed container and supports MCP server configuration through `.copilot/mcp.json`. Mouse can be made available to the coding agent for reliable file operations in back-end PR workflows.

**Why CLI matters:** The coding agent container needs:

1. Mouse installed (CLI handles this)
2. License activated (CLI handles this)
3. MCP configured (CLI handles this)
4. Diagnostics available if something fails (CLI handles this)

The `hic-mouse --token=xxx --yes` flow was designed exactly for this kind of automated, non-interactive provisioning. The `--yes` flag and `HIC_TOKEN` environment variable support are purpose-built for CI/container environments.

**Key insight:** This is where Mouse becomes genuinely differentiated. An AI coding agent operating in a back-end container, making reliable file edits via Mouse MCP tools, producing PRs that a human reviews — this is the full expression of the HIC vision: **Humans In Charge of policy and approval, AI agents executing with alignment.**

### 6.3 Containerized Async Background Workflows

**Use Case:** SWR (or a coding agent in the foreground) dispatches discrete, well-defined tasks to background containers. Each container has Mouse enabled, performs its assigned work, and reports back. The foreground agent continues other work while awaiting results.

**Why CLI matters:** Each container needs:

1. A Mouse binary that works without Node.js pre-installed (SEA)
2. License activation via environment variable (no interactive prompts)
3. MCP server startup and configuration
4. Clean exit codes for CI/CD orchestration

**Concurrency model:** Each container would need its own device activation slot. This may require adjustments to the Keygen device limit policy — currently configured for per-machine activation, which would need to account for ephemeral container instances. Options:

- Floating license pool (Keygen supports this)
- Short-lived activations with automatic deactivation on container shutdown
- Enterprise volume licensing with high device limits

**Container Dockerfile pattern:**

```dockerfile
FROM node:20-slim
COPY mouse-sea-linux-x64 /usr/local/bin/hic
RUN chmod +x /usr/local/bin/hic
ENV HIC_TOKEN=${HIC_TOKEN}
RUN hic mouse license activate $HIC_TOKEN
RUN hic mouse config init --yes
# MCP server now available for agent use
```

Or with SEA binary (no Node.js required):

```dockerfile
FROM ubuntu:22.04
COPY mouse-sea-linux-x64 /usr/local/bin/hic
RUN chmod +x /usr/local/bin/hic
ENV HIC_TOKEN=${HIC_TOKEN}
RUN hic mouse license activate $HIC_TOKEN
# Minimal footprint, maximum capability
```

### 6.4 IDE Platform Extensions (JetBrains, Visual Studio)

**Use Case:** Post-launch, extend Mouse to JetBrains IDEs (IntelliJ, PyCharm, etc.) and Visual Studio (not VS Code). Each platform has its own extension/plugin format:

- **JetBrains:** Kotlin/JVM plugins distributed via JetBrains Marketplace
- **Visual Studio:** C# extensions using different .vsix format (incompatible with VS Code .vsix)

**Why CLI matters:** The core Mouse engine (file operations, MCP protocol, licensing) is written in JavaScript. Platform-specific wrappers would:

1. Use the CLI/binary as the engine (cross-platform, already tested)
2. Add thin platform-specific UI layers (Kotlin for JetBrains, C# for VS Studio)
3. The wrapper starts the Mouse process, communicates via stdio MCP

This architecture (thin wrapper → CLI engine) is how many cross-IDE tools work (e.g., language servers). The CLI binary becomes the universal engine; each IDE gets a thin wrapper.

### 6.5 Enterprise Fleet Provisioning

**Use Case:** Enterprise customers with 50-500 developers need to deploy Mouse across their organization, often via IT-managed tools (MDM, Ansible, Chef, PowerShell scripts).

**Why CLI matters:** Enterprise IT teams need:

- A downloadable binary (not an npm package requiring Node.js)
- Silent installation: `hic mouse config init --yes`
- Scriptable license activation: `HIC_TOKEN=$CORP_TOKEN hic mouse license activate`
- Health checks for monitoring: `hic mouse doctor --json`
- Clean exit codes for automation scripts

The CLI is quite literally the enterprise deployment interface. The `--json` output format and exit codes were designed with this in mind.

---

## 7. Recommended Architecture for Post-Launch CLI

### 7.1 Phase 1: SEA Binary Distribution (Post-Launch, 6-10 hours)

**Goal:** Produce platform-specific binaries with strong IP protection.

**Deliverables:**

1. SEA build script (`scripts/build-sea.sh`) targeting:
   - `mouse-linux-x64`
   - `mouse-darwin-arm64`
   - `mouse-win-x64.exe`
2. GitHub Actions CI matrix for cross-platform builds
3. Binary artifact storage (GitHub Releases initially)
4. Integration with `scripts/release-mouse.sh`

**Build process:**

```bash
# 1. Bundle to single entry point (e.g., via esbuild or rollup)
npx esbuild packaging/cli/bin/hic.js --bundle --platform=node --outfile=dist/hic-bundled.js

# 2. Generate SEA blob
echo '{ "main": "dist/hic-bundled.js", "output": "dist/sea-prep.blob" }' > sea-config.json
node --experimental-sea-config sea-config.json

# 3. Copy Node.js binary and inject
cp $(which node) dist/hic
npx postject dist/hic NODE_SEA_BLOB dist/sea-prep.blob \
  --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
```

**Risk:** SEA is `--experimental` in Node.js 20, stable in Node.js 22+. By the time this is needed post-launch, Node.js 22 LTS will be well-established.

### 7.2 Phase 2: Gated Download Integration (Post-Launch + 2-4 weeks, 8-12 hours)

**Goal:** License-gated download page on hic-ai.com.

**Deliverables:**

1. Download API endpoint (Lambda function)
2. License key validation before serving binary
3. Platform auto-detection with manual override
4. Download tracking (CloudWatch metrics)
5. Integration with hic-ai.com download page

**Flow:**

```
User visits hic-ai.com/download
  → Enters license key
  → Backend validates key via Keygen API
  → Returns S3 presigned URL to platform-specific binary
  → User downloads and runs binary
```

### 7.3 Phase 3: Container-Native Distribution (Post-Launch + 4-8 weeks, 12-20 hours)

**Goal:** First-class container support for automated workflows.

**Deliverables:**

1. Official Docker base image with Mouse pre-installed
2. GitHub Action for Mouse setup (`hic-ai/setup-mouse`)
3. Floating license pool support (Keygen policy update)
4. Automatic deactivation on container shutdown (trap handler)
5. `.copilot/mcp.json` template for Copilot coding agent
6. Workflow template for async task dispatch

**GitHub Action usage:**

```yaml
- uses: hic-ai/setup-mouse@v1
  with:
    token: ${{ secrets.HIC_TOKEN }}
    clients: copilot
```

**Copilot coding agent integration:**

```json
// .copilot/mcp.json
{
  "servers": {
    "mouse": {
      "command": "/usr/local/bin/hic",
      "args": ["mcp-server"],
      "env": { "HIC_TOKEN": "${HIC_TOKEN}" }
    }
  }
}
```

---

## 8. Pre-Launch Decision

**Decision: Ship VSIX only for launch. Defer CLI to post-launch.**

| Factor                    | Assessment                                                          |
| ------------------------- | ------------------------------------------------------------------- |
| npm public path viable?   | No — IP protection incompatible                                     |
| Alternative paths ready?  | No — all require 6-12+ hours of new work                            |
| Is CLI needed for launch? | No — VSIX covers the launch use case                                |
| Does delay destroy value? | No — CLI value increases post-launch as automation use cases emerge |
| Is the CLI code lost?     | No — it's fully functional infrastructure ready for Phase 1         |

**Immediate action items:**

1. ~~Change `publishConfig.access` from `"public"` to `"restricted"` in `packaging/cli/package.json`~~ — or remove `publishConfig` entirely as a safety measure against accidental publication
2. Ensure `scripts/release-mouse.sh` defaults to `--skip-npm` (verify current behavior)
3. Add a note to the CLI README indicating it is maintained but not yet published

**Post-launch priority:** Phase 1 (SEA binary) should be the first post-launch engineering investment after stabilization. The automated playbook use case — dispatching work to Copilot coding agent containers with Mouse enabled — is both an internal productivity multiplier and a powerful commercial differentiator.

---

## Appendix A: File Inventory

### CLI Package (`packaging/cli/`)

| File                              | Lines | Purpose                                          |
| --------------------------------- | ----- | ------------------------------------------------ |
| `package.json`                    | 46    | Package manifest, bin entries, publishConfig     |
| `README.md`                       | 84    | User documentation                               |
| `bin/hic.js`                      | 89    | Main entry: `hic` command routing                |
| `bin/hic-mouse.js`                | 24    | PLG installer entry point                        |
| `bin/mouse.js`                    | 142   | Product handler: license, config, doctor routing |
| `bin/mouse-license.js`            | 148   | License subcommands via shared command layer     |
| `bin/mouse-config.js`             | 318   | MCP client configuration management              |
| `bin/mouse-doctor.js`             | 396   | Installation health diagnostics                  |
| `src/index.js`                    | 310   | PLG installer orchestration                      |
| `src/args.js`                     | —     | Argument parsing                                 |
| `src/configure.js`                | —     | VS Code configuration                            |
| `src/configure-clients.js`        | 577   | Multi-client MCP config engine (9 clients)       |
| `src/errors.js`                   | —     | CLI error types and exit codes                   |
| `src/install.js`                  | —     | Package installation logic                       |
| `src/token.js`                    | —     | Token validation and generation                  |
| `tests/args.test.js`              | —     | Argument parsing tests                           |
| `tests/configure-clients.test.js` | —     | Client configuration tests                       |
| `tests/install.test.js`           | —     | Installation and token tests                     |

### Shared Command Layer (`licensing/commands/`)

| File            | Purpose                                             |
| --------------- | --------------------------------------------------- |
| `index.js`      | Re-exports all commands with CLI formatter pairs    |
| `status.js`     | `getStatus()` + `formatStatusForCLI()`              |
| `activate.js`   | `activate()` + `formatActivateForCLI()`             |
| `deactivate.js` | `deactivate()` + `formatDeactivateForCLI()`         |
| `info.js`       | `getInfo()` + `formatInfoForCLI()`                  |
| `validate.js`   | `validate()` + `formatValidateForCLI()` + utilities |

### Release Integration (`scripts/release-mouse.sh`)

- Step 2 of the release process is npm build/publish
- `--skip-npm` flag available (noted as "deprecated channel")
- Script checks `npm whoami` before publishing

---

## Appendix B: Command Reference

### `hic` — Unified Management CLI

```
hic <product> <command> [options]

Products:
  mouse                 Mouse file editing tools

Global Commands:
  version               Show HIC CLI version
  help                  Show help
```

### `hic mouse` — Mouse Product Commands

```
hic mouse <command> [options]

Commands:
  license status              Show current license status
  license activate <key>      Activate a license key
  license deactivate          Deactivate from this device
  license info                Detailed license information

  config show                 Show MCP configuration status
  config clients              List available MCP clients
  config add <client>         Add MCP client configuration
  config remove <client>      Remove MCP client configuration
  config init                 Initialize all detected clients

  doctor                      Run installation diagnostics
  version                     Show Mouse version

Options:
  --json                      Output as JSON (where supported)
  --force                     Force operation (deactivate)
  --yes, -y                   Skip confirmation prompts
  --help, -h                  Show help
```

### `hic-mouse` — PLG Installer

```
hic-mouse [options]

Options:
  --token <token>             Authentication token (required)
  --token-file <path>         Read token from file
  --project <path>            Target project directory (default: cwd)
  --client <id>               Configure specific client(s) only
  --interactive, -i           Interactive client picker
  --yes, -y                   Auto-confirm for CI/automation
  --silent                    Suppress non-error output
  --verbose                   Detailed progress output

Environment Variables:
  HIC_TOKEN                   Alternative to --token
  HIC_SILENT                  Set to "1" for silent mode
  HIC_NO_TELEMETRY            Set to "1" to opt out

Token Types:
  hic_ent_xxx                 Enterprise (1 year)
  hic_trial_xxx               Trial (14 days)
  hic_inv_xxx                 Investor (30 days)
  hic_eval_xxx                Evaluation (7 days)

Supported Clients (--client values):
  copilot, claudeCode, kiloCode, cursor, kiro,
  continue, cline, rooCode, codegpt
```

---

_This report documents findings as of February 16, 2026. The CLI infrastructure at `packaging/cli/` is fully functional and will serve as the foundation for post-launch distribution when IP-protecting distribution paths (SEA binary, gated download) are implemented._
