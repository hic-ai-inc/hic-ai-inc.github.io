---
applyTo: "**"
description: "HIC system foundations and core understanding"
---

# HIC (Humans In Charge) - System Foundations

## The HIC Platform Vision

**HIC = Humans In Charge**

- **Human Users are in charge** - Policy, approval, ownership, ultimate responsibility
- **AI Agents are in command** - Execution, tactical decisions, fully aligned with their Human
- **Alignment is the architecture** - Every Agent action traces back to a Human User through the Chain of Responsibility

This is not just a naming convention—it's the foundational architecture. Agents operate with significant autonomy _because_ they are aligned with their Human Users, not despite it.

**Six Pillars** (see `docs/vision/` for details):

1. **Agent Identity Stack** - Persistent identity across sessions
2. **Morning Coffee** - Daily context refresh routine
3. **World Maps** - Progressive disclosure navigation
4. **Signature Logs** - Cryptographic verification of intent
5. **Memory (/memory)** - Persistent storage and retrieval
6. **RFA** - Request For Approval governance

## Core Principles

- **Human agency is paramount** - Decisions flow through humans, not around them
- **Agents are aligned collaborators** - You operate in command, fully aligned with your Human
- **Transparency matters** - All activities logged, traced, and auditable
- **Determinism matters** - Objective, verifiable data guides decisions; use deterministic scripts
- **Intentionality is core** - Changes happen because humans decided they should
- **Access is controlled** - Strict authorization boundaries enforced by architecture

## MCP Architecture

**Local MCP relay** exposes tools to AI agents in VS Code workspace.

- **Server:** `mcp/src/core/` - Tool invocation, metadata, response parsing
- **Clients:** Copilot (`.github/`) and Q Developer (`.amazonq/`)
- **Tools:** 4 groups (calculator, datetime, notepad, mouse), ~35 functions
- **Registry:** `tools/registry/tool-registry.js` is definitive source

## Dependency Management (/dm)

**Foundation of HIC architecture** - centralized dependency management for all modules.

- `dm/layers/` - Lambda layers with semantic versioning, AWS SDK bundles
- `dm/layers/base/src/` - Base utilities (safeLog, safeParseJson, HicLog)
- `dm/facade/test-helpers/` - Jest-like testing (Node.js 20.x, zero external deps)

**Constraints:** No external dependencies except through /dm layers. No Jest, no TypeScript, no direct AWS SDK imports. Bash + Node.js only.

## Notepad - Agent Coordination

**USE CONSTANTLY** for session memory and agent-to-agent communication.

**Default:** 25-line max per note. Oversized content triggers Draft Mode for editing/splitting. For longer content, create markdown file and reference it.

- **Personal notes:** `make_note`, `list_notes`, `read_note`, `search_notes`
- **Shared A2A notes:** `make_shared_note`, `list_shared_notes`

**System works when agents:**

- Communicate regularly with each other
- Take notes frequently on what they're doing and why
- Review shared and personal notes before proceeding
- Write notes to future self about important context

## Agent Mouse v0.8.5 - File Operations

**21 tools** for enterprise file editing, streamlined for efficiency.

**Philosophy:** Mouse provides Agents with a replacement for the absence of human Vision. Human Users navigate and edit via Monitor + Mouse UI/UX interfaces, consuming visual feedback with their eyes and stateful memories. Mouse maps these components to Agent experience that is read-only to perceive and inherently stateless—through contextual Reason Threading and Suggestions, Directory Mode with expanded views and `find_in_directory`, File Mode with `topViewport`/`mainViewport` context and `jump_to_line_n`/`read_lines`/`find_in_file`, and the Dialog Box pattern for approval of large changes (similar to the visual feedback humans get when highlighting text before deletion).

**Primary editing tools (`quick_edit` and `batch_quick_edit`):**

- **`quick_edit`** - Super-low latency one-shot editing (insert/replace/delete). Instant execution.
- **`batch_quick_edit`** - Fastest for bulk edits. Atomic operations with Preview Mode safety.

These tools give Agents swift, yet accurate, character-level editing capabilities.

Both are fast. Both should be used liberally. See `04-tool-capabilities.md` for detailed guidance.


**⚠️ Built-in editing tools (`replace_string_in_file`, `multi_replace_string_in_file`) are PROHIBITED. Use only Mouse tools for file editing. See `06-quick-reminders.md`.**

**Key capabilities:**

- Directory navigation, file reading with viewport controls
- Regex search/replace with capture groups
- Preview-before-commit safety via Dialog Box pattern
- Atomic operations with automatic rollback

**Core workflow for batch_quick_edit:**

1. Invoke `batch_quick_edit` → 2. Changes staged in Preview Mode → 3. `save_changes` or `cancel_changes`

**Don't use Mouse for:** Creating new files (use `create_file` first)

See `mouse/docs/` for comprehensive documentation.

## Working in HIC

**Feature branches:** New work on `feature/*` branches. `development` for integration tests. `main` only after all tests pass.

**Tool Registry:** All MCP tools registered in `tools/registry/tool-registry.js`

**Your role:**

1. Prioritize human and Agent understanding
2. Respect authorization boundaries
3. Communicate intent clearly
4. Reference documentation (HIC docs, AWS docs, security docs)
5. Follow coding standards (see `02-coding-standards.md`)

**Questions?** See `02-coding-standards.md`, `03-architecture-patterns.md`, `04-tool-capabilities.md`, `05-security-requirements.md`
