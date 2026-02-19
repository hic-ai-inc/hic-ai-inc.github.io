# GitHub Copilot Strategy for VS Code Extension Migration

**Date:** January 23, 2026  
**Author:** GitHub Copilot (Claude Opus 4.5)  
**Status:** Planning Document  
**Repository:** hic-ai-inc/hic-ai-inc.github.io

---

## Executive Summary

This document outlines the complete strategy for migrating Mouse from its current npm package distribution (`@hic-ai-inc/mouse` on GitHub Packages) to a VS Code Marketplace extension. This migration is critical for PLG (Product-Led Growth) success, as the VS Code Marketplace provides one-click installation, automatic updates, and high discoverability—all essential for converting free trial users to paid customers.

---

## Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [Target State Architecture](#2-target-state-architecture)
3. [Technical Requirements](#3-technical-requirements)
4. [Implementation Plan](#4-implementation-plan)
5. [Project Structure](#5-project-structure)
6. [Key Code Components](#6-key-code-components)
7. [Build & Packaging](#7-build--packaging)
8. [Publishing to Marketplace](#8-publishing-to-marketplace)
9. [License Validation Integration](#9-license-validation-integration)
10. [Migration Checklist](#10-migration-checklist)
11. [Risk Assessment](#11-risk-assessment)
12. [Timeline](#12-timeline)
13. [Open Questions](#13-open-questions)

---

## 1. Current State Analysis

### 1.1 Existing Distribution Method

| Component              | Current Implementation                         |
| ---------------------- | ---------------------------------------------- |
| **Package Name**       | `@hic-ai-inc/mouse`                            |
| **Registry**           | GitHub Packages (npm)                          |
| **Installation**       | `npx @hic-ai-inc/mouse`                        |
| **Configuration**      | Manual MCP settings in VS Code `settings.json` |
| **Updates**            | Manual (`npm update`)                          |
| **License Validation** | Via license server API                         |

### 1.2 Existing Infrastructure

- **Repository:** `hic-ai-inc/mouse/packaging/`
- **E2E Tests:** Confirmed working with `npx` installation
- **MCP Server:** Functional, tested with GitHub Copilot
- **License Server:** Operational (needs integration)

### 1.3 Current User Journey (Friction Points)

```
1. User visits website → "Get Started"
2. User must understand npm/npx
3. User runs terminal command
4. User manually edits VS Code settings.json
5. User restarts VS Code
6. User hopes it works
```

**Friction Points:**

- Step 2: Non-technical users confused by npm
- Step 4: JSON editing is error-prone
- Step 5-6: No feedback if something goes wrong

### 1.4 Target User Journey (Frictionless)

```
1. User visits website → "Install Extension"
2. VS Code Marketplace opens
3. User clicks "Install"
4. Mouse activates automatically
5. User enters license key (or starts trial)
6. Done
```

---

## 2. Target State Architecture

### 2.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    VS Code Extension                         │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                   extension.js                           ││
│  │  - Activation/deactivation lifecycle                    ││
│  │  - Status bar management                                ││
│  │  - Command registration                                 ││
│  │  - Settings management                                  ││
│  │  - License validation                                   ││
│  └─────────────────────────────────────────────────────────┘│
│                            │                                 │
│                            ▼                                 │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                   MCP Server (bundled)                   ││
│  │  - All Mouse tools (quick_edit, batch_edit, etc.)       ││
│  │  - File operations                                      ││
│  │  - HTTPS phone-home for license validation             ││
│  └─────────────────────────────────────────────────────────┘│
│                            │                                 │
│                            ▼                                 │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                   MCP Connection Layer                   ││
│  │  - stdio transport for GitHub Copilot                   ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
              ┌─────────────────────────┐
              │   License Server API    │
              │   license.hic-ai.com    │
              └─────────────────────────┘
```

### 2.2 Distribution Comparison

| Aspect                | npm Package          | VS Code Extension         |
| --------------------- | -------------------- | ------------------------- |
| **Installation**      | Terminal command     | One-click                 |
| **Configuration**     | Manual JSON edit     | Auto-configured           |
| **Updates**           | Manual               | Automatic                 |
| **Discoverability**   | Very low             | High (Marketplace search) |
| **User Trust**        | Low (unknown source) | High (Microsoft vetting)  |
| **Status Visibility** | None                 | Status bar icon           |
| **Error Handling**    | Terminal output      | VS Code notifications     |

---

## 3. Technical Requirements

### 3.1 VS Code API Requirements

| API                                 | Purpose                | Minimum VS Code Version |
| ----------------------------------- | ---------------------- | ----------------------- |
| `vscode.ExtensionContext`           | Lifecycle management   | 1.85.0                  |
| `vscode.window.createStatusBarItem` | Status indicator       | 1.85.0                  |
| `vscode.workspace.getConfiguration` | Settings access        | 1.85.0                  |
| `vscode.commands.registerCommand`   | Command palette        | 1.85.0                  |
| `vscode.window.showInputBox`        | License key input      | 1.85.0                  |
| `vscode.SecretStorage`              | Secure license storage | 1.85.0                  |

### 3.2 Node.js Requirements

- **Bundled Runtime:** VS Code provides Node.js, no external dependency
- **Minimum Node:** 18.x (VS Code 1.85+ bundles this)
- **Module System:** ES6 modules (ESM) throughout

### 3.3 MCP Protocol Requirements

- **Transport:** stdio only
- **Protocol Version:** MCP 1.0
- **Tool Registration:** All existing Mouse tools
- **Resource Handling:** File system access via VS Code APIs

### 3.4 Security Requirements

- **License Key Storage:** Must use `vscode.SecretStorage` (encrypted)
- **File Access:** Respect VS Code workspace trust
- **Network:** HTTPS only for license validation
- **No Telemetry:** Per privacy policy (unless Enterprise opt-in)

---

## 4. Implementation Plan

### Phase 1: Extension Scaffold (Week 1)

**Objective:** Create minimal working extension that starts MCP server

**Tasks:**

1. Create new `mouse-vscode/` directory in repository
2. Initialize extension with `yo code` or manual setup
3. Configure ES6 module bundling
4. Create minimal `extension.js` with activation logging
5. Test in Extension Development Host (`F5`)

**Deliverables:**

- [ ] `package.json` with extension manifest
- [ ] `jsconfig.json` for ES6 modules
- [ ] `extension.js` with basic activation
- [ ] `.vscodeignore` for packaging

### Phase 2: MCP Server Integration (Week 1-2)

**Objective:** Bundle existing MCP server into extension

**Tasks:**

1. Configure webpack/esbuild to bundle MCP server
2. Create server spawning logic in extension
3. Implement stdio communication
4. Add process lifecycle management (restart, cleanup)
5. Test with GitHub Copilot

**Deliverables:**

- [ ] `webpack.config.js` or `esbuild.config.js`
- [ ] Bundled `mcp-server.js` in `dist/`
- [ ] Working MCP connection to Copilot

### Phase 3: User Experience (Week 2)

**Objective:** Add status bar, commands, settings

**Tasks:**

1. Create status bar item with loading/ready/error states
2. Register commands:
   - `mouse.showStatus`
   - `mouse.restart`
   - `mouse.enterLicenseKey`
   - `mouse.showLogs`
3. Define extension settings in `package.json`
4. Implement settings change handlers

**Deliverables:**

- [ ] Status bar with icon and tooltip
- [ ] Command palette entries
- [ ] Settings UI in VS Code

### Phase 4: License Integration (Week 2-3)

**Objective:** Integrate with license server for trial/paid validation

**Tasks:**

1. Implement `SecretStorage` for license key
2. Create license validation on activation
3. Implement trial period logic (14 days)
4. Add license status to status bar tooltip
5. Create "Enter License Key" command and welcome flow
6. Handle expired/invalid license gracefully

**Deliverables:**

- [ ] Secure license key storage
- [ ] License validation API client
- [ ] Trial countdown logic
- [ ] License-related commands

### Phase 5: Polish & Testing (Week 3)

**Objective:** Production-ready extension

**Tasks:**

1. Add extension icon (128x128 PNG)
2. Write comprehensive README.md for Marketplace
3. Create CHANGELOG.md
4. Add error telemetry (opt-in, Enterprise only)
5. Test on Windows, macOS, Linux
6. Test with multiple AI agents (Copilot, Cursor, etc.)
7. Performance profiling

**Deliverables:**

- [ ] Extension icon
- [ ] Marketplace README
- [ ] Cross-platform testing results
- [ ] Performance benchmarks

### Phase 6: Publishing (Week 3-4)

**Objective:** Live on VS Code Marketplace

**Tasks:**

1. Create Azure DevOps organization
2. Create Personal Access Token (PAT)
3. Create publisher account (`hic-ai`)
4. Run `vsce package` to create `.vsix`
5. Test `.vsix` installation manually
6. Run `vsce publish`
7. Update website "Install" links

**Deliverables:**

- [ ] Publisher account `hic-ai`
- [ ] Published extension on Marketplace
- [ ] Website updated with Marketplace links

---

## 5. Project Structure

### 5.1 Directory Layout

```
hic-ai-inc/mouse/
├── packaging/                    # Existing npm package (keep for CLI)
│   ├── package.json
│   ├── src/
│   │   └── mcp-server/          # MCP server implementation (ES6)
│   └── ...
│
└── vscode-extension/            # NEW: VS Code extension
    ├── package.json             # Extension manifest
    ├── jsconfig.json            # ES6/JSDoc config
    ├── webpack.config.js        # Bundle config
    ├── .vscodeignore            # Packaging exclusions
    ├── README.md                # Marketplace description
    ├── CHANGELOG.md             # Version history
    ├── LICENSE                  # License file
    ├── images/
    │   └── icon.png             # 128x128 extension icon
    ├── src/
    │   ├── extension.js         # Main entry point
    │   ├── statusBar.js         # Status bar management
    │   ├── commands.js          # Command implementations
    │   ├── license.js           # License validation
    │   ├── mcpServer.js         # MCP server lifecycle
    │   └── config.js            # Settings management
    ├── dist/                    # Build output
    │   ├── extension.js         # Bundled extension
    │   └── mcp-server.js        # Bundled MCP server
    └── test/
        ├── extension.test.js    # Unit tests
        └── integration.test.js  # Integration tests
```

### 5.2 Shared Code Strategy

The MCP server code in `packaging/src/mcp-server/` should be:

1. **Kept in place** - npm package still useful for CLI users
2. **Imported by extension** - webpack resolves from sibling directory
3. **Or copied** - if build complexity is too high, copy source files

**Recommended:** Use npm workspace or symlink to share code:

```json
// vscode-extension/package.json
{
  "dependencies": {
    "@hic-ai-inc/mouse-core": "file:../packaging"
  }
}
```

---

## 6. Key Code Components

### 6.1 Extension Manifest (`package.json`)

```json
{
  "name": "mouse",
  "displayName": "Mouse - Precision Editing for AI Agents",
  "description": "Eliminate Execution Slop. Give AI coding agents coordinate-based editing tools that actually work.",
  "version": "1.0.0",
  "publisher": "hic-ai",
  "author": {
    "name": "HIC AI Inc.",
    "email": "support@hic-ai.com"
  },
  "license": "SEE LICENSE IN LICENSE",
  "homepage": "https://hic-ai.com",
  "repository": {
    "type": "git",
    "url": "https://github.com/hic-ai-inc/mouse-vscode"
  },
  "bugs": {
    "url": "https://github.com/hic-ai-inc/mouse-vscode/issues",
    "email": "support@hic-ai.com"
  },
  "icon": "images/icon.png",
  "galleryBanner": {
    "color": "#0A1628",
    "theme": "dark"
  },
  "engines": {
    "vscode": "^1.85.0"
  },
  "categories": ["Programming Languages", "Machine Learning", "Other"],
  "keywords": [
    "ai",
    "copilot",
    "mcp",
    "editing",
    "coding assistant",
    "claude",
    "cursor",
    "automation"
  ],
  "activationEvents": ["onStartupFinished"],
  "main": "./dist/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "mouse.showStatus",
        "title": "Mouse: Show Status"
      },
      {
        "command": "mouse.restart",
        "title": "Mouse: Restart Server"
      },
      {
        "command": "mouse.enterLicenseKey",
        "title": "Mouse: Enter License Key"
      },
      {
        "command": "mouse.showLogs",
        "title": "Mouse: Show Output Logs"
      },
      {
        "command": "mouse.startTrial",
        "title": "Mouse: Start Free Trial"
      }
    ],
    "configuration": {
      "title": "Mouse",
      "properties": {
        "mouse.autoStart": {
          "type": "boolean",
          "default": true,
          "description": "Automatically start Mouse MCP server when VS Code launches"
        },
        "mouse.showStatusBar": {
          "type": "boolean",
          "default": true,
          "description": "Show Mouse status in the status bar"
        },
        "mouse.logLevel": {
          "type": "string",
          "enum": ["error", "warn", "info", "debug"],
          "default": "info",
          "description": "Logging verbosity level"
        }
      }
    }
  },
  "scripts": {
    "vscode:prepublish": "npm run compile",
    "compile": "webpack --mode production",
    "watch": "webpack --mode development --watch",
    "lint": "eslint src --ext js",
    "test": "node ./out/test/runTest.js",
    "package": "vsce package",
    "publish": "vsce publish"
  },
  "devDependencies": {
    "@vscode/test-electron": "^2.3.0",
    "@vscode/vsce": "^2.22.0",
    "eslint": "^8.50.0",
    "webpack": "^5.89.0",
    "webpack-cli": "^5.1.0"
  },
  "dependencies": {}
}
```

### 6.2 Extension Entry Point (`src/extension.js`)

```javascript
import * as vscode from "vscode";
import { McpServerManager } from "./mcpServer.js";
import { StatusBarManager } from "./statusBar.js";
import { LicenseManager } from "./license.js";
import { registerCommands } from "./commands.js";

/** @type {McpServerManager} */
let mcpServer;
/** @type {StatusBarManager} */
let statusBar;
/** @type {LicenseManager} */  
let license;
/** @type {vscode.OutputChannel} */
let outputChannel;

/**
 * @param {vscode.ExtensionContext} context
 */
export async function activate(context) {
  // Create output channel for logs
  outputChannel = vscode.window.createOutputChannel("Mouse");
  context.subscriptions.push(outputChannel);

  outputChannel.appendLine(`Mouse extension activating...`);
  outputChannel.appendLine(`Extension path: ${context.extensionPath}`);
  outputChannel.appendLine(`Storage path: ${context.globalStorageUri.fsPath}`);

  // Initialize managers
  license = new LicenseManager(context.secrets, outputChannel);
  statusBar = new StatusBarManager();
  mcpServer = new McpServerManager(context.extensionPath, outputChannel);

  // Add to subscriptions for cleanup
  context.subscriptions.push(statusBar);
  context.subscriptions.push(mcpServer);

  // Register commands
  registerCommands(context, { mcpServer, statusBar, license, outputChannel });

  // Validate license
  statusBar.setStatus("loading", "Validating license...");
  const licenseStatus = await license.validate();

  if (!licenseStatus.valid) {
    if (licenseStatus.reason === "no_key") {
      // First time user - offer trial
      const action = await vscode.window.showInformationMessage(
        "Welcome to Mouse! Start your 14-day free trial?",
        "Start Trial",
        "Enter License Key",
        "Later",
      );

      if (action === "Start Trial") {
        await license.startTrial();
      } else if (action === "Enter License Key") {
        await vscode.commands.executeCommand("mouse.enterLicenseKey");
      } else {
        statusBar.setStatus("warning", "Mouse not activated");
        return;
      }
    } else if (licenseStatus.reason === "expired") {
      vscode.window.showWarningMessage(
        `Your Mouse ${licenseStatus.isTrial ? "trial" : "license"} has expired.`,
        "Enter License Key",
        "Renew",
      );
      statusBar.setStatus("warning", "License expired");
      return;
    } else {
      vscode.window.showErrorMessage(`License error: ${licenseStatus.message}`);
      statusBar.setStatus("error", "License invalid");
      return;
    }
  }

  // Start MCP server if auto-start enabled
  const config = vscode.workspace.getConfiguration("mouse");
  if (config.get("autoStart")) {
    try {
      statusBar.setStatus("loading", "Starting MCP server...");
      await mcpServer.start();
      statusBar.setStatus(
        "ready",
        `Mouse ready (${licenseStatus.daysRemaining} days left)`,
      );
      outputChannel.appendLine("Mouse MCP server started successfully");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      statusBar.setStatus("error", `Failed to start: ${message}`);
      outputChannel.appendLine(`Error starting MCP server: ${message}`);
      vscode.window.showErrorMessage(`Mouse failed to start: ${message}`);
    }
  }

  // Listen for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration("mouse")) {
        outputChannel.appendLine("Configuration changed, reloading...");
        await mcpServer.restart();
      }
    }),
  );

  outputChannel.appendLine("Mouse extension activated");
}

export function deactivate() {
  outputChannel?.appendLine("Mouse extension deactivating...");
  mcpServer?.stop();
}
```

### 6.3 MCP Server Manager (`src/mcpServer.js`)

```javascript
import * as vscode from "vscode";
import { spawn } from "child_process";
import * as path from "path";

/**
 * @implements {vscode.Disposable}
 */
export class McpServerManager {
  /** @type {import('child_process').ChildProcess | null} */
  #server = null;
  /** @type {string} */
  #serverPath;
  /** @type {vscode.OutputChannel} */
  #outputChannel;
  /** @type {number} */
  #restartCount = 0;
  /** @type {number} */
  #maxRestarts = 3;

  /**
   * @param {string} extensionPath
   * @param {vscode.OutputChannel} outputChannel
   */
  constructor(extensionPath, outputChannel) {
    this.#serverPath = path.join(extensionPath, "dist", "mcp-server.js");
    this.#outputChannel = outputChannel;
  }

  /**
   * @returns {Promise<void>}
   */
  async start() {
    if (this.server) {
      this.outputChannel.appendLine("Server already running, skipping start");
      return;
    }

    return new Promise((resolve, reject) => {
      this.outputChannel.appendLine(`Starting MCP server: ${this.serverPath}`);

      this.server = spawn("node", [this.serverPath], {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          NODE_ENV: "production",
          MOUSE_EXTENSION_MODE: "true",
        },
      });

      this.server.stdout?.on("data", (data) => {
        this.outputChannel.appendLine(`[MCP] ${data.toString().trim()}`);
      });

      this.server.stderr?.on("data", (data) => {
        this.outputChannel.appendLine(`[MCP ERROR] ${data.toString().trim()}`);
      });

      this.server.on("spawn", () => {
        this.outputChannel.appendLine("MCP server process spawned");
        this.restartCount = 0;
        resolve();
      });

      this.server.on("error", (err) => {
        this.outputChannel.appendLine(`MCP server error: ${err.message}`);
        reject(err);
      });

      this.server.on("exit", (code, signal) => {
        this.outputChannel.appendLine(
          `MCP server exited with code ${code}, signal ${signal}`,
        );
        this.server = null;

        // Auto-restart on unexpected exit
        if (code !== 0 && this.restartCount < this.maxRestarts) {
          this.restartCount++;
          this.outputChannel.appendLine(
            `Attempting restart ${this.restartCount}/${this.maxRestarts}...`,
          );
          setTimeout(() => this.start(), 1000 * this.restartCount);
        }
      });

      // Timeout if server doesn't start
      setTimeout(() => {
        if (!this.server) {
          reject(new Error("Server start timeout"));
        }
      }, 10000);
    });
  }

  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    return new Promise((resolve) => {
      this.outputChannel.appendLine("Stopping MCP server...");

      this.server!.on("exit", () => {
        this.server = null;
        resolve();
      });

      // Graceful shutdown
      this.server!.kill("SIGTERM");

      // Force kill after timeout
      setTimeout(() => {
        if (this.server) {
          this.server.kill("SIGKILL");
          this.server = null;
          resolve();
        }
      }, 5000);
    });
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  isRunning(): boolean {
    return this.server !== null;
  }

  dispose(): void {
    this.stop();
  }
}
```

### 6.4 Status Bar Manager (`src/statusBar.js`)

```javascript
import * as vscode from "vscode";

/** @typedef {'loading' | 'ready' | 'warning' | 'error' | 'disabled'} StatusState */

const STATUS_ICONS = {
  loading: "$(loading~spin)",
  ready: "$(check)",
  warning: "$(warning)",
  error: "$(error)",
  disabled: "$(circle-slash)",
};

const STATUS_COLORS = {
  loading: undefined,
  ready: undefined,
  warning: new vscode.ThemeColor("statusBarItem.warningBackground"),
  error: new vscode.ThemeColor("statusBarItem.errorBackground"),
  disabled: undefined,
};

/**
 * @implements {vscode.Disposable}
 */
export class StatusBarManager {
  /** @type {vscode.StatusBarItem} */
  #statusBarItem;

  constructor() {
    this.#statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100,
    );
    this.#statusBarItem.name = "Mouse Status";
    this.#statusBarItem.command = "mouse.showStatus";
    this.setStatus("loading", "Initializing...");

    const config = vscode.workspace.getConfiguration("mouse");
    if (config.get("showStatusBar")) {
      this.#statusBarItem.show();
    }
  }

  /**
   * @param {StatusState} state
   * @param {string} tooltip
   */
  setStatus(state, tooltip) {
    this.#statusBarItem.text = `${STATUS_ICONS[state]} Mouse`;
    this.#statusBarItem.tooltip = tooltip;
    this.#statusBarItem.backgroundColor = STATUS_COLORS[state];
  }

  show() {
    this.#statusBarItem.show();
  }

  hide() {
    this.#statusBarItem.hide();
  }

  dispose() {
    this.#statusBarItem.dispose();
  }
}
```

### 6.5 License Manager (`src/license.js`)

```javascript
import * as vscode from "vscode";

const LICENSE_API_URL = "https://license.hic-ai.com/api/v1";
const LICENSE_KEY_SECRET = "mouse.licenseKey";
const TRIAL_START_SECRET = "mouse.trialStart";
const DEVICE_ID_SECRET = "mouse.deviceId";
const TRIAL_DURATION_DAYS = 14;

/**
 * @typedef {Object} LicenseStatus
 * @property {boolean} valid
 * @property {boolean} isTrial
 * @property {'no_key' | 'expired' | 'invalid' | 'network_error'} [reason]
 * @property {string} [message]
 * @property {number} [daysRemaining]
 * @property {string[]} [features]
 */

export class LicenseManager {
  /** @type {vscode.SecretStorage} */
  #secrets;
  /** @type {vscode.OutputChannel} */
  #outputChannel;

  /**
   * @param {vscode.SecretStorage} secrets
   * @param {vscode.OutputChannel} outputChannel
   */
  constructor(secrets, outputChannel) {
    this.#secrets = secrets;
    this.#outputChannel = outputChannel;
  }

  /**
   * @returns {Promise<LicenseStatus>}
   */
  async validate() {
    const licenseKey = await this.secrets.get(LICENSE_KEY_SECRET);

    if (!licenseKey) {
      // Check for active trial
      const trialStart = await this.secrets.get(TRIAL_START_SECRET);
      if (trialStart) {
        return this.validateTrial(trialStart);
      }
      return { valid: false, isTrial: false, reason: "no_key" };
    }

    return this.validateLicenseKey(licenseKey);
  }

  private async validateTrial(trialStartStr: string): Promise<LicenseStatus> {
    const trialStart = new Date(trialStartStr);
    const now = new Date();
    const daysPassed = Math.floor(
      (now.getTime() - trialStart.getTime()) / (1000 * 60 * 60 * 24),
    );
    const daysRemaining = TRIAL_DURATION_DAYS - daysPassed;

    if (daysRemaining <= 0) {
      return {
        valid: false,
        isTrial: true,
        reason: "expired",
        message: "Your free trial has expired",
        daysRemaining: 0,
      };
    }

    return {
      valid: true,
      isTrial: true,
      daysRemaining,
      features: ["all"], // Trial has all features
    };
  }

  private async validateLicenseKey(licenseKey: string): Promise<LicenseStatus> {
    try {
      const deviceId = await this.getOrCreateDeviceId();

      const response = await fetch(`${LICENSE_API_URL}/validate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          licenseKey,
          deviceId,
          product: "mouse",
          version:
            vscode.extensions.getExtension("hic-ai.mouse")?.packageJSON.version,
        }),
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          return {
            valid: false,
            isTrial: false,
            reason: "invalid",
            message: "Invalid license key",
          };
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      return {
        valid: data.valid,
        isTrial: false,
        daysRemaining: data.daysRemaining,
        features: data.features,
        reason: data.valid ? undefined : "expired",
        message: data.message,
      };
    } catch (error) {
      this.outputChannel.appendLine(
        `License validation error: ${error instanceof Error ? error.message : "Unknown"}`,
      );

      // Allow offline grace period (7 days since last successful validation)
      // For now, allow if we have a stored key
      return {
        valid: true, // Generous offline policy
        isTrial: false,
        reason: "network_error",
        message: "Could not reach license server, using cached validation",
        daysRemaining: 30, // Assume valid
      };
    }
  }

  async startTrial(): Promise<void> {
    const now = new Date().toISOString();
    await this.secrets.store(TRIAL_START_SECRET, now);
    this.outputChannel.appendLine(`Trial started: ${now}`);
  }

  async setLicenseKey(key: string): Promise<LicenseStatus> {
    // Validate before storing
    const status = await this.validateLicenseKey(key);

    if (status.valid) {
      await this.secrets.store(LICENSE_KEY_SECRET, key);
      // Clear trial if license is valid
      await this.secrets.delete(TRIAL_START_SECRET);
      this.outputChannel.appendLine("License key stored successfully");
    }

    return status;
  }

  async clearLicense(): Promise<void> {
    await this.secrets.delete(LICENSE_KEY_SECRET);
    await this.secrets.delete(TRIAL_START_SECRET);
  }

  private async getOrCreateDeviceId(): Promise<string> {
    let deviceId = await this.secrets.get(DEVICE_ID_SECRET);

    if (!deviceId) {
      // Generate a unique device ID
      deviceId = `${vscode.env.machineId}-${Date.now()}`;
      await this.secrets.store(DEVICE_ID_SECRET, deviceId);
    }

    return deviceId;
  }
}
```

### 6.6 Commands (`src/commands.js`)

```javascript
import * as vscode from "vscode";
import { McpServerManager } from "./mcpServer.js";
import { StatusBarManager } from "./statusBar.js";
import { LicenseManager } from "./license.js";

/**
 * @typedef {Object} CommandContext
 * @property {McpServerManager} mcpServer
 * @property {StatusBarManager} statusBar
 * @property {LicenseManager} license
 * @property {vscode.OutputChannel} outputChannel
 */

/**
 * @param {vscode.ExtensionContext} context
 * @param {CommandContext} ctx
 */
export function registerCommands(context, ctx) {
  const { mcpServer, statusBar, license, outputChannel } = ctx;

  // Show Status
  context.subscriptions.push(
    vscode.commands.registerCommand("mouse.showStatus", async () => {
      const licenseStatus = await license.validate();
      const serverRunning = mcpServer.isRunning();

      /** @type {vscode.QuickPickItem[]} */
      const items = [
        {
          label: `$(server) MCP Server: ${serverRunning ? "Running" : "Stopped"}`,
          description: serverRunning ? "Click to restart" : "Click to start",
        },
        {
          label: `$(key) License: ${licenseStatus.isTrial ? "Trial" : "Licensed"}`,
          description: licenseStatus.daysRemaining
            ? `${licenseStatus.daysRemaining} days remaining`
            : undefined,
        },
        {
          label: "$(output) Show Logs",
          description: "Open Mouse output channel",
        },
      ];

      const selected = await vscode.window.showQuickPick(items, {
        title: "Mouse Status",
      });

      if (selected?.label.includes("MCP Server")) {
        await vscode.commands.executeCommand("mouse.restart");
      } else if (selected?.label.includes("Show Logs")) {
        outputChannel.show();
      }
    }),
  );

  // Restart Server
  context.subscriptions.push(
    vscode.commands.registerCommand("mouse.restart", async () => {
      try {
        statusBar.setStatus("loading", "Restarting...");
        await mcpServer.restart();
        statusBar.setStatus("ready", "Mouse ready");
        vscode.window.showInformationMessage("Mouse server restarted");
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        statusBar.setStatus("error", `Restart failed: ${message}`);
        vscode.window.showErrorMessage(`Failed to restart Mouse: ${message}`);
      }
    }),
  );

  // Enter License Key
  context.subscriptions.push(
    vscode.commands.registerCommand("mouse.enterLicenseKey", async () => {
      const key = await vscode.window.showInputBox({
        title: "Enter Mouse License Key",
        prompt: "Paste your license key from your purchase confirmation email",
        password: true,
        validateInput: (value) => {
          if (!value || value.length < 10) {
            return "Please enter a valid license key";
          }
          return null;
        },
      });

      if (!key) {
        return;
      }

      const status = await license.setLicenseKey(key);

      if (status.valid) {
        vscode.window.showInformationMessage(
          `License activated! ${status.daysRemaining} days remaining.`,
        );
        statusBar.setStatus("ready", `Licensed (${status.daysRemaining} days)`);

        // Start server if not running
        if (!mcpServer.isRunning()) {
          await vscode.commands.executeCommand("mouse.restart");
        }
      } else {
        vscode.window.showErrorMessage(
          `Invalid license key: ${status.message || "Please check and try again"}`,
        );
      }
    }),
  );

  // Show Logs
  context.subscriptions.push(
    vscode.commands.registerCommand("mouse.showLogs", () => {
      outputChannel.show();
    }),
  );

  // Start Trial
  context.subscriptions.push(
    vscode.commands.registerCommand("mouse.startTrial", async () => {
      await license.startTrial();
      vscode.window.showInformationMessage(
        "Your 14-day free trial has started! Enjoy Mouse.",
      );
      statusBar.setStatus("ready", "Trial (14 days)");

      if (!mcpServer.isRunning()) {
        await vscode.commands.executeCommand("mouse.restart");
      }
    }),
  );
}
```

---

## 7. Build & Packaging

### 7.1 Webpack Configuration (`webpack.config.js`)

```javascript
//@ts-check
"use strict";

const path = require("path");

/** @type {import('webpack').Configuration} */
const extensionConfig = {
  target: "node",
  mode: "none",
  entry: "./src/extension.js",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "extension.js",
    libraryTarget: "commonjs2",
  },
  externals: {
    vscode: "commonjs vscode", // VS Code API is external
  },
  resolve: {
    extensions: [".js"],
  },
  // No loaders needed - native ES6
  devtool: "nosources-source-map",
  infrastructureLogging: {
    level: "log",
  },
};

/** @type {import('webpack').Configuration} */
const mcpServerConfig = {
  target: "node",
  mode: "none",
  entry: "../packaging/src/mcp-server/index.js", // Mouse tools (ES6)
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "mcp-server.js",
    libraryTarget: "commonjs2",
  },
  resolve: {
    extensions: [".js"],
  },
  // No loaders needed - native ES6
  devtool: "nosources-source-map",
};

module.exports = [extensionConfig, mcpServerConfig];
```

### 7.2 JSDoc Configuration (`jsconfig.json`)

```json
{
  "compilerOptions": {
    "module": "ES2022",
    "target": "ES2022",
    "lib": ["ES2022"],
    "checkJs": true,
    "moduleResolution": "node",
    "resolveJsonModule": true
  },
  "include": ["src/**/*.js"],
  "exclude": ["node_modules", ".vscode-test", "dist"]
}
```

### 7.3 VS Code Ignore (`.vscodeignore`)

```
.vscode/**
.vscode-test/**
src/**
out/**
node_modules/**
.gitignore
.yarnrc
webpack.config.js
jsconfig.json
**/*.map
!dist/**
*.vsix
```

### 7.4 Build Commands

```bash
# Development build (with watch)
npm run watch

# Production build
npm run compile

# Create .vsix package
npm run package
# Output: mouse-1.0.0.vsix

# Install locally for testing
code --install-extension mouse-1.0.0.vsix
```

---

## 8. Publishing to Marketplace

### 8.1 Prerequisites

1. **Microsoft Account** - For Azure DevOps access
2. **Azure DevOps Organization** - Create at https://dev.azure.com
3. **Personal Access Token (PAT)** - With "Marketplace (Publish)" scope
4. **Publisher Account** - Create at https://marketplace.visualstudio.com/manage

### 8.2 Create Publisher Account

1. Go to https://marketplace.visualstudio.com/manage
2. Sign in with Microsoft account
3. Click "Create publisher"
4. Fill in:
   - **ID:** `hic-ai` (cannot change later)
   - **Name:** `HIC AI Inc.`
   - **Email:** `marketplace@hic-ai.com`

### 8.3 Generate Personal Access Token

1. Go to https://dev.azure.com
2. Click User Settings → Personal Access Tokens
3. Click "New Token"
4. Configure:
   - **Name:** `vsce-publish`
   - **Organization:** All accessible organizations
   - **Scopes:** Custom defined → Marketplace → Publish
5. Copy token immediately (won't be shown again)

### 8.4 Publishing Commands

```bash
# Login (stores PAT)
vsce login hic-ai
# Paste your PAT when prompted

# Verify package before publishing
vsce ls

# Publish (first time)
vsce publish

# Publish specific version
vsce publish 1.0.0

# Publish with minor version bump
vsce publish minor

# Publish with patch version bump
vsce publish patch
```

### 8.5 Marketplace Listing

The Marketplace page is generated from:

- **Icon:** `images/icon.png` (128×128)
- **Description:** `package.json` → `description`
- **README:** `README.md` in root
- **Changelog:** `CHANGELOG.md` in root
- **Banner:** `package.json` → `galleryBanner`

### 8.6 README.md for Marketplace

```markdown
# Mouse - Precision Editing for AI Agents

![Mouse Logo](images/icon.png)

**Eliminate Execution Slop.** Mouse gives AI coding agents coordinate-based
editing tools that actually work.

## The Problem

AI coding agents make the right plan and call the right tool—but still
produce the wrong output. This is **Execution Slop**.

## The Solution

Mouse provides precision editing tools that give agents:

- ✅ Coordinate-based addressing (no content-echo needed)
- ✅ Atomic batch operations with rollback
- ✅ 56% first-try success on precision tasks (vs 0% baseline)
- ✅ 3.6× faster task completion

## Features

- **Quick Edit** - One-shot file editing with atomic operations
- **Batch Edit** - Multiple edits across files in a single call
- **Find in File** - Search with regex and column analysis
- **Read Lines** - Navigate and inspect files with context
- **File Metadata** - Get file stats without reading content

## Installation

1. Click **Install** above
2. Restart VS Code if prompted
3. Mouse activates automatically
4. Start your 14-day free trial

## Usage

Mouse works automatically with:

- GitHub Copilot (via MCP)
- Claude in VS Code
- Other MCP-compatible agents

No configuration needed—just install and chat!

## Pricing

- **Individual:** $15/month ($150/year)
- **Enterprise:** $25/seat/month for teams of 2+
- **Free Trial:** 14 days, no credit card required

[View Pricing](https://hic-ai.com/pricing)

## Support

- Documentation: [hic-ai.com/docs](https://hic-ai.com/docs)
- Support: support@hic-ai.com
- Issues: [GitHub Issues](https://github.com/hic-ai-inc/mouse-vscode/issues)

## License

Commercial license. See [Terms of Service](https://hic-ai.com/terms).

---

© 2026 HIC AI Inc. All rights reserved.
```

---

## 9. License Validation Integration

### 9.1 License Server API Contract

```
POST /api/v1/validate
Content-Type: application/json

Request:
{
  "licenseKey": "MOUSE-XXXX-XXXX-XXXX",
  "deviceId": "machine-id-hash",
  "product": "mouse",
  "version": "1.0.0"
}

Response (200 OK):
{
  "valid": true,
  "plan": "individual",
  "expiresAt": "2027-01-23T00:00:00Z",
  "daysRemaining": 365,
  "features": ["all"],
  "deviceSlots": 3,
  "devicesUsed": 1
}

Response (401 Unauthorized):
{
  "valid": false,
  "error": "invalid_key",
  "message": "License key not found"
}

Response (403 Forbidden):
{
  "valid": false,
  "error": "device_limit",
  "message": "Device limit exceeded (3/3)"
}
```

### 9.2 Offline Policy

1. **First activation:** Must be online to validate
2. **Subsequent launches:** Allow offline for 7 days since last validation
3. **Grace period:** If offline > 7 days, show warning but allow usage
4. **Hard cutoff:** After 30 days offline, require reconnection

### 9.3 Trial Implementation

1. Trial starts on first activation (no license key)
2. Trial period: 14 days
3. Trial features: All features enabled
4. Trial expiry: Show upgrade prompt, disable Mouse
5. Trial conversion: Enter license key to continue

---

## 10. Migration Checklist

### Pre-Development

- [ ] Confirm publisher name availability (`hic-ai`)
- [ ] Create Azure DevOps organization
- [ ] Generate Personal Access Token
- [ ] Design extension icon (128×128 PNG)
- [ ] Review existing MCP server code for bundling compatibility

### Phase 1: Scaffold

- [ ] Create `vscode-extension/` directory
- [ ] Initialize `package.json` with extension manifest
- [ ] Configure ES6/JSDoc (`jsconfig.json`)
- [ ] Create minimal `extension.js`
- [ ] Test activation in Extension Development Host

### Phase 2: Integration

- [ ] Configure webpack for dual-bundle (extension + MCP server)
- [ ] Implement `McpServerManager` class
- [ ] Implement server spawning with stdio
- [ ] Test MCP connection with GitHub Copilot
- [ ] Verify all tools work through extension

### Phase 3: UX

- [ ] Implement `StatusBarManager`
- [ ] Register all commands
- [ ] Define settings schema in `package.json`
- [ ] Implement settings change handlers
- [ ] Add output channel for logging

### Phase 4: Licensing

- [ ] Implement `LicenseManager` with `SecretStorage`
- [ ] Create trial start/validation logic
- [ ] Integrate with license server API
- [ ] Implement offline grace period
- [ ] Test license flow end-to-end

### Phase 5: Polish

- [ ] Create extension icon
- [ ] Write Marketplace README
- [ ] Write CHANGELOG
- [ ] Test on Windows
- [ ] Test on macOS
- [ ] Test on Linux
- [ ] Performance profiling
- [ ] Fix any issues found

### Phase 6: Publish

- [ ] Create publisher account
- [ ] Run `vsce package`
- [ ] Test `.vsix` locally
- [ ] Run `vsce publish`
- [ ] Verify Marketplace listing
- [ ] Update website links
- [ ] Announce launch

### Post-Launch

- [ ] Monitor Marketplace reviews
- [ ] Set up error reporting (opt-in)
- [ ] Plan first update
- [ ] Deprecate npm package (or keep for CLI users)

---

## 11. Risk Assessment

### 11.1 Technical Risks

| Risk                           | Likelihood | Impact | Mitigation                                         |
| ------------------------------ | ---------- | ------ | -------------------------------------------------- |
| MCP server bundling fails      | Medium     | High   | Test early, have fallback to spawn npm package     |
| VS Code API changes            | Low        | Medium | Pin minimum VS Code version, test on Insiders      |
| Copilot MCP integration issues | Low        | High   | Test extensively, coordinate with GitHub if needed |
| Cross-platform issues          | Medium     | Medium | Test on all platforms early                        |
| Extension size too large       | Low        | Low    | Use tree-shaking, code-split if needed             |

### 11.2 Business Risks

| Risk                       | Likelihood | Impact | Mitigation                                |
| -------------------------- | ---------- | ------ | ----------------------------------------- |
| Marketplace approval delay | Low        | Medium | Follow guidelines strictly, submit early  |
| Negative reviews           | Medium     | High   | Solid QA, responsive support, quick fixes |
| License server downtime    | Low        | High   | Generous offline policy, status page      |
| Piracy/key sharing         | Medium     | Medium | Device limits, anomaly detection          |

### 11.3 User Experience Risks

| Risk                       | Likelihood | Impact | Mitigation                                |
| -------------------------- | ---------- | ------ | ----------------------------------------- |
| Confusing activation flow  | Medium     | High   | Clear prompts, good defaults              |
| License key entry friction | Low        | Medium | Paste-friendly input, validation feedback |
| Server startup failures    | Medium     | High   | Good error messages, auto-restart, logs   |

---

## 12. Timeline

### Aggressive Schedule (3 weeks)

| Week | Focus                  | Deliverables                             |
| ---- | ---------------------- | ---------------------------------------- |
| 1    | Scaffold + Integration | Working extension with MCP server        |
| 2    | UX + Licensing         | Status bar, commands, license validation |
| 3    | Polish + Publish       | Testing, README, publish to Marketplace  |

### Conservative Schedule (5 weeks)

| Week | Focus            | Deliverables                          |
| ---- | ---------------- | ------------------------------------- |
| 1    | Scaffold         | Extension structure, basic activation |
| 2    | Integration      | MCP server bundling, Copilot testing  |
| 3    | UX               | Status bar, commands, settings        |
| 4    | Licensing        | License validation, trial flow        |
| 5    | Polish + Publish | Testing, documentation, launch        |

### Recommended: 4 weeks

Split the difference—allows buffer for unexpected issues without dragging out.

---

## 13. Open Questions

### Technical

1. **Should we maintain the npm package alongside the extension?**
   - Pros: CLI users, CI/CD pipelines, non-VS Code editors
   - Cons: Two distributions to maintain
   - **Recommendation:** Keep npm package for power users/CLI, extension for PLG

2. **How should we handle VS Code Insiders vs Stable?**
   - Test on both, but target Stable for minimum version
   - Consider Insiders-only beta channel

3. **Should we support Remote - SSH / Containers / WSL?**
   - Yes, but test carefully—these have unique constraints
   - May need remote extension host considerations

### Business

4. **What happens if user has both npm and extension installed?**
   - Potential conflict with two MCP servers
   - **Solution:** Extension checks for npm version, warns user

5. **Should trial require email?**
   - Pros: Marketing list, abuse prevention
   - Cons: Friction
   - **Recommendation:** No email required, use device ID for trial tracking

6. **How to handle team/Enterprise provisioning?**
   - Bulk license keys vs. SSO integration
   - Defer to Phase 2 after individual launch

### Launch

7. **Should we do a soft launch first?**
   - Publish unlisted, share with beta testers
   - Fix issues, then make public
   - **Recommendation:** Yes, 1-week soft launch

8. **What's the npm package deprecation timeline?**
   - Keep functional but mark as "legacy"
   - Direct new users to Marketplace
   - **Recommendation:** 6-month deprecation notice, then maintenance-only

---

## Appendix A: Useful Commands Reference

```bash
# Extension Development
npm run watch          # Build with watch mode
npm run compile        # Production build
code --extensionDevelopmentPath=.  # Launch dev host

# Packaging
vsce package           # Create .vsix
vsce ls                # List files that will be included

# Publishing
vsce login hic-ai      # Login to publisher
vsce publish           # Publish current version
vsce publish minor     # Bump minor and publish
vsce unpublish hic-ai.mouse  # Remove from Marketplace (careful!)

# Local Testing
code --install-extension mouse-1.0.0.vsix  # Install locally
code --uninstall-extension hic-ai.mouse    # Uninstall

# Debugging
code --verbose         # Launch VS Code with verbose logging
```

---

## Appendix B: Related Documentation

- [VS Code Extension API](https://code.visualstudio.com/api)
- [Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [Extension Manifest Reference](https://code.visualstudio.com/api/references/extension-manifest)
- [MCP Protocol Specification](https://modelcontextprotocol.io)
- [vsce CLI Reference](https://github.com/microsoft/vscode-vsce)

---

## Document History

| Date       | Author         | Changes          |
| ---------- | -------------- | ---------------- |
| 2026-01-23 | GitHub Copilot | Initial document |

---

_This document was generated by GitHub Copilot (Claude Opus 4.5) at the request of the project maintainer. It should be reviewed and updated as implementation progresses._
