# MCP Client Compatibility with Mouse

**Created:** February 25, 2026
**Purpose:** Definitive compatibility matrix for all MCP clients targeted for Mouse v0.10.x launch. Drives final implementation of `Mouse: Initialize Workspace` config generation and Phase 2 documentation.
**Owner:** GC (research + implementation) | SWR (E2E validation)
**Status:** 🔄 In progress — skeleton assembled, fields to be completed per client

---

## Background

`Mouse: Initialize Workspace` installs the `.hic/` bundle into the workspace and writes an MCP config file for the selected client. The config file must be exactly correct — wrong file path, wrong JSON key, wrong field presence — and the MCP server connection silently fails with a `-32000 MCP server connection lost` error that gives the user no actionable feedback.

The path to `server.js` is always one of two canonical forms:

- `${workspaceFolder}/.hic/mcp/src/core/server.js` — for clients that expand VS Code variable substitution before spawning the Node process
- `./.hic/mcp/src/core/server.js` — for clients that spawn Node with cwd set to the workspace root

Both forms work on Windows, macOS, and Linux without modification. Node.js guarantees forward-slash path resolution on all platforms, so no OS-specific variants are needed. The same value used in `args` is also used for `HIC_ALLOWED_DIRECTORIES` in the `env` block.

The problem reduces to: for each client, knowing the correct values for the 9 variables below.

---

## The 9 Variables

### 1. Config file path

The file path (relative to workspace root, or absolute for global-only clients) where the MCP config must be written. Getting this wrong means the client never sees the config at all.

**What we need:** The exact file path the client reads for MCP server definitions, per current client documentation or confirmed empirically.

---

### 2. `${workspaceFolder}` substitution: yes or no

Whether the client expands VS Code-style variable substitution (`${workspaceFolder}`) inside the config file before spawning the MCP server process. If yes, we use the `${workspaceFolder}/...` path form. If no, we use the `./...` relative form (relying on cwd = workspace root).

**What we need:** Confirmed yes/no per client. This cannot be inferred — it must be tested or sourced from authoritative docs, because a client that silently passes `${workspaceFolder}` as a literal string to Node will fail with a file-not-found error.

---

### 3. Permits project-level config: yes or no

Whether the client reads an MCP config file from within the workspace/project directory, or whether it only reads from a global config location (e.g., VS Code `globalStorage`, `~/.config`, etc.). Project-level config is strongly preferred because it is workspace-specific, can be committed to source control, and can be written safely by the extension without path traversal concerns.

**What we need:** Confirmed yes/no. If no, the client is a global-only client and requires a different installation strategy (manual paste, or extension writing to globalStorage with an absolute path baked in — which breaks on project switch).

---

### 4. Top-level servers key: `"mcpServers"` or `"servers"`

The JSON key under which MCP server definitions are nested. The two known values are `"mcpServers"` (the original MCP spec convention) and `"servers"` (used by GitHub Copilot and, as discovered Feb 25, Q Developer). Using the wrong key means the client parses the file successfully but finds no servers.

**What we need:** The exact key string per client, confirmed from docs or empirically.

---

### 5. Transport field: `"type"`, `"transport"`, or omit

How (or whether) the stdio transport is declared in the server config object. Three observed behaviors:

- `"type": "stdio"` — original MCP convention, accepted by most clients
- `"transport": "stdio"` — alternative field name used by some clients
- Omit entirely — some clients (e.g., Q Developer as of Feb 25) reject unknown fields and infer stdio as the default; specifying `"type"` causes a schema validation error

**What we need:** Whether to include a transport field, which field name, and what value — or whether to omit it entirely.

---

### 6. `"cwd"` behavior

How the client sets the working directory when spawning the MCP server process. Three cases:

- Client sets cwd to workspace root automatically — relative paths work, no `"cwd"` field needed
- Client requires explicit `"cwd"` field — must be set to the workspace root path
- Client does not set cwd to workspace root and ignores `"cwd"` — relative paths break; must use `${workspaceFolder}` form instead

This variable determines which of the two canonical path forms is correct for a given client, and whether a `"cwd"` field must be included in the generated config.

**What we need:** Confirmed cwd behavior per client, ideally verified by inspecting `process.cwd()` in the spawned server process during Stream 1D testing.

---

### 7. `"env"` merge behavior: merges with parent or replaces

Whether the client merges the `"env"` block from the config with the parent process environment, or replaces it entirely. Mouse requires `HIC_AGENT_ADAPTER` and `HIC_ALLOWED_DIRECTORIES` to be set. If the client replaces rather than merges, the spawned Node process loses `PATH`, `HOME`, `NODE_PATH`, and other critical environment variables, causing failures that are difficult to diagnose.

**What we need:** Confirmed merge vs. replace behavior per client. If any client replaces, we would need to include `PATH` and other essentials explicitly in the `"env"` block.

---

### 8. Schema strictness: rejects unknown fields or tolerant

Whether the client validates the MCP config against a strict schema and rejects unrecognized fields, or tolerates extra fields. Q Developer (discovered Feb 25) is an example of a strict client: it rejected `"type": "stdio"` because its schema uses `"transport"` instead, causing the server to fail to connect. Tolerant clients (most) simply ignore fields they don't recognize.

**What we need:** Confirmed strictness level per client. For strict clients, the generated config must contain only the fields that client's schema explicitly supports.

---

### 9. Current `Mouse: Initialize Workspace` result

What actually happens today when the user runs `Ctrl-Shift-P > Mouse: Initialize Workspace` and selects this client. This captures the current implementation state so we know exactly what needs to change — and what already works — before touching any code.

**What we need:** One of the following, with specifics:

- ✅ **Works end-to-end** — config file generated correctly, MCP connects, tools available
- ⚠️ **Partial** — config file generated but with wrong name, wrong key, wrong field, or wrong path; MCP fails to connect; describe what was generated and what was wrong
- ❌ **No config generated** — `Mouse: Initialize Workspace` completes but writes no MCP config file for this client
- 🔲 **Not yet tested**

---

## Diagnostic Commands — `cwd` and `env` Behavior

During E2E validation, run the following commands in a Git Bash terminal inside Codespaces or locally in the IDE to determine variables 6 (`cwd` behavior) and 7 (`env` merge behavior) for each client without modifying any source code. These inspect the running MCP server process via `/proc`.

### Step 1: Find the MCP server PID

```bash
ps aux | grep 'server\.js' | grep -v grep
```

If multiple Node processes are running, narrow it down:

```bash
pgrep -f '.hic/mcp/src/core/server.js'
```

Capture the PID for use in the next steps:

```bash
MCP_PID=$(pgrep -f '.hic/mcp/src/core/server.js')
echo "MCP server PID: $MCP_PID"
```

### Step 2: Determine `cwd` behavior

```bash
ls -la /proc/$MCP_PID/cwd
```

This prints a symlink showing the actual working directory the client set when spawning the server process. Compare against the workspace root to determine whether the client sets cwd automatically.

### Step 3: Determine `env` merge behavior

Print all environment variables visible to the MCP server process:

```bash
cat /proc/$MCP_PID/environ | tr '\0' '\n' | sort
```

To check specifically whether `PATH` and `HOME` survived (merge) or are absent (replace):

```bash
cat /proc/$MCP_PID/environ | tr '\0' '\n' | grep -E '^(PATH|HOME|HIC_AGENT_ADAPTER|HIC_ALLOWED_DIRECTORIES)='
```

If `PATH` and `HOME` are present alongside `HIC_AGENT_ADAPTER` and `HIC_ALLOWED_DIRECTORIES`, the client merges. If only the `HIC_*` variables appear, the client replaces.

### One-liner (copy-paste friendly)

All three steps combined — paste once, get all results:

```bash
MCP_PID=$(pgrep -f '.hic/mcp/src/core/server.js' | head -1) && \
  echo "=== PID: $MCP_PID ===" && \
  echo "=== cwd ===" && \
  readlink /proc/$MCP_PID/cwd && \
  echo "=== env (key vars) ===" && \
  cat /proc/$MCP_PID/environ | tr '\0' '\n' | grep -E '^(PATH|HOME|HIC_AGENT_ADAPTER|HIC_ALLOWED_DIRECTORIES|NODE_PATH)=' && \
  echo "=== env (full) ===" && \
  cat /proc/$MCP_PID/environ | tr '\0' '\n' | sort
```

---

## Client Compatibility Matrix

### 1. VS Code / GitHub Copilot

| Variable | Value | Notes |
|---|---|---|
| Config file path | `.vscode/mcp.json` | |
| `${workspaceFolder}` substitution | Yes | Also works with `./` relative paths |
| Project-level config | Yes | |
| Servers key | `"servers"` | VS Code shows schema error if `"mcpServers"` is used instead |
| Transport field | `"type": "stdio"` | Works with `"type"` or omitted; does not accept `"transport"` |
| `cwd` behavior | Sets cwd to workspace root automatically | Confirmed via `/proc/<pid>/cwd` → `/workspaces/hic-e2e-clean` |
| `env` merge behavior | Merges | Server runs successfully with `PATH` and `HOME` inherited from parent process |
| Schema strictness | Tolerant | Accepts extra fields without error |
| `Mouse: Initialize Workspace` result | ✅ Works end-to-end | Config generated correctly, MCP connects, tools available |

---

### 2. VS Code / Amazon Q Developer

| Variable | Value | Notes |
|---|---|---|
| Config file path | `.amazonq/mcp.json` | Creating this file auto-generates `.amazonq/agents/default.json` |
| `${workspaceFolder}` substitution | No | |
| Project-level config | Yes | |
| Servers key | `"mcpServers"` | MCP server errors if "servers" is used instead |
| Transport field | `"transport": "stdio"` | `"type": "stdio"` errors; omitting transport field works |
| `cwd` behavior | Set to workspace root automatically | |
| `env` merge behavior | Merges | |
| Schema strictness | Strict | |
| `Mouse: Initialize Workspace` result | Installs the wrong config file path (`.amazonq/default.json`); includes `"type": "stdio"`; attempts to use `${workspaceFolder}` for "envs" and HIC_ALLOWED_DIRECTORIES | |

---

### 3. VS Code / Cline

| Variable | Value | Notes |
|---|---|---|
| Config file path | | |
| `${workspaceFolder}` substitution | | |
| Project-level config | | |
| Servers key | | |
| Transport field | | |
| `cwd` behavior | | |
| `env` merge behavior | | |
| Schema strictness | | |
| `Mouse: Initialize Workspace` result | | |

> ⚠️ Cline is currently global-only (reads from VS Code `globalStorage`, not from the workspace). Launch support is under review — may be deferred. See Stream 1D notes.

---

### 4. VS Code / Kilo Code

| Variable | Value | Notes |
|---|---|---|
| Config file path | `.kilocode/mcp.json` | |
| `${workspaceFolder}` substitution | Yes | Also works with relative `./` paths |
| Project-level config | Yes | |
| Servers key | `"mcpServers"` | Error if replaced with "servers" |
| Transport field | "type" or "transport" | Works with "type", "transport", or if omitted |
| `cwd` behavior | Set to workspace root automatically | |
| `env` merge behavior | Merges | |
| Schema strictness | Tolerant | |
| `Mouse: Initialize Workspace` result | Installs working config file but HIC_ALLOWED_DIRECTORIES was set to: `/workspaces/hic-e2e-clean/`; should be either `${workspaceFolder}` or `./` | |

---

### 5. VS Code / Roo Code

| Variable | Value | Notes |
|---|---|---|
| Config file path | `.roo/mcp.json` | |
| `${workspaceFolder}` substitution | Yes | Also fine with `./` |
| Project-level config | Yes | |
| Servers key | "mcpServers" | |
| Transport field | "type" or "transport" | Works with "type", "transport", or if omitted |
| `cwd` behavior | Set to workspace root automatically | |
| `env` merge behavior | Merges | |
| Schema strictness | Tolerant | |
| `Mouse: Initialize Workspace` result | **No** MCP config file generated by initializing workspace | |

---

### 6. VS Code / Claude Code (extension)

| Variable | Value | Notes |
|---|---|---|
| Config file path | | |
| `${workspaceFolder}` substitution | | |
| Project-level config | | |
| Servers key | | |
| Transport field | | |
| `cwd` behavior | | |
| `env` merge behavior | | |
| Schema strictness | | |
| `Mouse: Initialize Workspace` result | | |

See entries for Claude Code CLI below.

---

### 7. VS Code / Claude Code CLI

| Variable | Value | Notes |
|---|---|---|
| Config file path | .mcp.json | NOTE: There is no `.claude/` directory; `.mcp.json` resides at project directory root |
| `${workspaceFolder}` substitution | Yes | Also works with relative `./` |
| Project-level config | Yes | |
| Servers key | `"mcpServers"` | "servers" errors |
| Transport field | "type" | "transport" errors; "type" can be omitted altogether |
| `cwd` behavior | Automatically set to project workspace root | |
| `env` merge behavior | Merges | |
| Schema strictness | Tolerant | |
| `Mouse: Initialize Workspace` result | Successfully installs `.mcp.json` properly configured | Installation also auto-generates `.claude/settings.local.json` with additional configurations that can be modified |

> ℹ️ Claude Code CLI operates outside VS Code. MCP config location and behavior may differ from the VS Code extension variant.

#### Codespaces Authentication Setup (Bedrock)

Claude Code's default login flow (`/login`) redirects to the Anthropic IdP via a localhost callback. In Codespaces this fails because the browser redirect targets a local port that Codespaces cannot forward reliably. The fix is to bypass the Anthropic login entirely by setting `CLAUDE_CODE_USE_BEDROCK=1`, which disables `/login` and `/logout` and routes all inference through your existing AWS Bedrock credentials.

Two authentication options are documented below. Both are fully CLI-based and avoid passing secrets in plaintext to the shell.

**Prerequisites (both options):**

- Bedrock model access enabled in your AWS account (one-time use-case form submitted via the Bedrock console Chat/Text playground)
- IAM permissions: `bedrock:InvokeModel`, `bedrock:InvokeModelWithResponseStream`, `bedrock:ListInferenceProfiles` on `arn:aws:bedrock:*:*:inference-profile/*`, `arn:aws:bedrock:*:*:foundation-model/*`
- Claude Code VS Code extension installed (bundles the `claude` CLI)

---

**Option A — AWS SSO profile**

Use this if you authenticate to AWS via SSO / Identity Center.

```bash
# 1. Configure the SSO profile (one-time; follow the interactive prompts)
aws configure sso --profile bedrock-claude

# 2. Log in via SSO (opens browser for IdP authentication)
aws sso login --profile bedrock-claude

# 3. Verify credentials are live
aws sts get-caller-identity --profile bedrock-claude

# 4. Export the environment variables Claude Code needs
export CLAUDE_CODE_USE_BEDROCK=1
export AWS_REGION=us-east-1          # adjust to your Bedrock-enabled region
export AWS_PROFILE=bedrock-claude

# 5. (Optional) Pin model versions
export ANTHROPIC_MODEL='us.anthropic.claude-sonnet-4-6'
export ANTHROPIC_SMALL_FAST_MODEL='us.anthropic.claude-haiku-4-5-20251001-v1:0'

# 6. Launch Claude Code
claude
```

To persist across terminal sessions in the same Codespace, append the `export` lines (steps 4–5) to `~/.bashrc`. You will still need to re-run `aws sso login` when the SSO session expires.

---

**Option C — Bedrock API key (bearer token)**

Use this if you have a Bedrock API key and want the simplest possible setup with no AWS CLI profile.

```bash
# 1. Export the Bedrock flag and region
export CLAUDE_CODE_USE_BEDROCK=1
export AWS_REGION=us-east-1          # adjust to your Bedrock-enabled region

# 2. Securely input the Bedrock API key (read -s suppresses echo;
#    the value will not appear in the terminal or in .bash_history)
read -s -p "Bedrock API key: " AWS_BEARER_TOKEN_BEDROCK && echo
export AWS_BEARER_TOKEN_BEDROCK

# 3. (Optional) Pin model versions
export ANTHROPIC_MODEL='us.anthropic.claude-sonnet-4-6'
export ANTHROPIC_SMALL_FAST_MODEL='us.anthropic.claude-haiku-4-5-20251001-v1:0'

# 4. Launch Claude Code
claude
```

`read -s` is a bash builtin — the value is never written to disk, never appears in `ps` output, and never enters `.bash_history`. The key lives only in the shell process's environment for the duration of the session.

---

**VS Code extension settings (applies to both options)**

If using the Claude Code VS Code extension rather than (or in addition to) the bare CLI, add the following to `.vscode/settings.json` in the Codespace so the extension picks up the same configuration:

```json
{
  "claudeCode.environmentVariables": [
    { "name": "CLAUDE_CODE_USE_BEDROCK", "value": "1" },
    { "name": "AWS_REGION", "value": "us-east-1" }
  ],
  "claudeCode.disableLoginPrompt": true
}
```

For Option A, add an additional entry: `{ "name": "AWS_PROFILE", "value": "bedrock-claude" }`. For Option C, do not put the bearer token in `settings.json` — export it in the terminal before launching.

---

**Troubleshooting**

| Symptom | Cause | Fix |
|---|---|---|
| Browser redirects to `localhost:PORT` and times out | `CLAUDE_CODE_USE_BEDROCK` not set; Claude Code is attempting the Anthropic OAuth flow | `export CLAUDE_CODE_USE_BEDROCK=1` and restart |
| "Please log in" prompt reappears after authenticating via Anthropic Console | Anthropic Console auth succeeded but Claude Code still expects a subscription | Set `CLAUDE_CODE_USE_BEDROCK=1`; this disables the login requirement entirely |
| `ExpiredTokenException` or credential errors | SSO session expired (Option A) or bearer token expired (Option C) | Re-run `aws sso login --profile bedrock-claude` (A) or re-export the token via `read -s` (C) |
| `AccessDeniedException` on `InvokeModel` | IAM policy missing required Bedrock actions | Add `bedrock:InvokeModelWithResponseStream` and `bedrock:ListInferenceProfiles` to the policy |
| "on-demand throughput isn't supported" | Model ID used instead of inference profile ID | Use the `us.anthropic.*` inference profile IDs, not raw model IDs |

> 📖 Source: [Claude Code on Amazon Bedrock — Anthropic Docs](https://docs.anthropic.com/en/docs/claude-code/amazon-bedrock). Content was rephrased for compliance with licensing restrictions.

---

### 8. VS Code / Copilot CLI
|---|---|---|
| Config file path | `~/.copilot/mcp-config.json` | Global only; no project-level config supported. Override location via `XDG_CONFIG_HOME` env var. |
| `${workspaceFolder}` substitution | No | Global config requires absolute paths |
| Project-level config | No | Global only; manual config file creation or `/mcp add` may work but not yet confirmed |
| Servers key | | Not yet confirmed — likely `"servers"` (consistent with Copilot Chat) but Codespace crashed before verification |
| Transport field | | Not yet confirmed — Codespace crashed before verification |
| `cwd` behavior | | Not yet tested — Codespace crashed before `/proc` diagnostic could run |
| `env` merge behavior | | Not yet tested |
| Schema strictness | | Not yet tested |
| `Mouse: Initialize Workspace` result | ❌ No config generated | Global-only client; `Mouse: Initialize Workspace` does not write outside the project root. Manual setup required. |

> ⚠️ Copilot CLI (v0.0.418) is a full agentic coding tool with MCP support (`/mcp` command, sub-agents, `/fleet`, autopilot mode). It is not a VS Code extension — it is installed via `gh` CLI (`sudo apt install gh`, then `gh copilot`). MCP config is global-only (`~/.copilot/mcp-config.json`). Initial E2E test (Feb 25) resulted in a crash after `/mcp add`; further testing deferred.
---

### 9. VS Code / CodeGPT

| Variable | Value | Notes |
|---|---|---|
| Config file path | | |
| `${workspaceFolder}` substitution | | |
| Project-level config | | |
| Servers key | | |
| Transport field | | |
| `cwd` behavior | | |
| `env` merge behavior | | |
| Schema strictness | | |
| `Mouse: Initialize Workspace` result | | |

**NOTE:** The CodeGPT extension no longer appears to support MCP compatibility. Although the docs point to a single MCP setup page, that page in turn references a "Beta" functionality via screenshots that do not match the UI. Inside the current CodeGPT UI, there is no way to add MCP functionality. We are **removing** CodeGPT from the list.

---

### 10. Cursor

| Variable | Value | Notes |
|---|---|---|
| Config file path | `.cursor/mcp.json` | |
| `${workspaceFolder}` substitution | Yes | Also fine with `./` |
| Project-level config | Yes | |
| Servers key | `"mcpServers"` | "servers" errors |
| Transport field | "type" or "transport" | Also works if omitted |
| `cwd` behavior | Automatically set to project workspace root | |
| `env` merge behavior | Merges | |
| Schema strictness | Tolerant | |
| `Mouse: Initialize Workspace` result | Successfully installs a correctly-configured `.cursor/mcp.json` file | |

---

### 11. Kiro

| Variable | Value | Notes |
|---|---|---|
| Config file path | `.kiro/settings/mcp.json` | |
| `${workspaceFolder}` substitution | Yes | Also works with ./ |
| Project-level config | Yes | |
| Servers key | "mcpServers" | "servers" errors |
| Transport field | "type" | Also works if omitted |
| `cwd` behavior | Automatically set to project workspace root | |
| `env` merge behavior | Merges | |
| Schema strictness | Tolerant | |
| `Mouse: Initialize Workspace` result | Configured correctly except for using an absolute path for HIC_ALLOWED_DIRECTORIES instead of ${workspaceFolder} or ./ | | 

> **Note:** The absolute path issue is caused by `supportsWorkspaceVar: false` in `clients.js`, which tells `generateServerConfig()` to use `projectDir` (absolute path) instead of `"${workspaceFolder}"` for `HIC_ALLOWED_DIRECTORIES`. Since Kiro does support `${workspaceFolder}` substitution (confirmed via E2E test), the fix is to change `supportsWorkspaceVar` to `true` in the Kiro client definition, which will generate `HIC_ALLOWED_DIRECTORIES: "${workspaceFolder}"` instead of the absolute path.

---

## Decisions Log

| ID | Decision | Date |
|---|---|---|
| — | — | — |

---

## Open Questions

- Q Developer: confirm whether `"servers"` key is correct per current docs, or whether this was a schema change in a recent release
- Roo Code: update `clients.js` entry from `type: "global"` to `type: "workspace-local"`, remove `requiresCwd: true`
- Cline: go/no-go decision for launch support
- CodeGPT: confirm whether project-level config is supported in any recent release
- Claude Code CLI / Copilot CLI: confirm whether these are in scope for `Mouse: Initialize Workspace` or documented separately as manual setup
