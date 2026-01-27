---
applyTo: "**"
description: "HIC platform vision and architecture"
---

<!-- ⛔ MANDATORY: Use Mouse tools (quick_edit, batch_quick_edit) for ALL file editing. See 00-mandatory-tool-rules.md -->

# HIC System Foundations

## Vision

**HIC = Humans In Charge**

- **Human Users** - Policy, approval, ownership, responsibility
- **AI Agents** - Execution, tactical decisions, aligned with Human
- **Alignment is the architecture** - Every action traces to a Human

## MCP Architecture

Local relay exposes tools to AI agents in VS Code:

- **Server:** `mcp/src/core/`
- **Tools:** 4 groups (~27 functions): calculator, datetime, notepad, mouse
- **Registry:** `tools/registry/tool-registry.js`

## Dependency Management (/dm)

- `dm/layers/` - Lambda layers, AWS SDK bundles
- `dm/facade/test-helpers/` - Jest-like testing (zero external deps)
- **Constraints:** Bash + Node.js only. No TypeScript, no Jest, no direct AWS SDK imports.

## Notepad

**USE CONSTANTLY** for session memory and agent coordination:

- `make_note` / `make_shared_note` - Remember and coordinate
- `list_notes` / `search_notes` - Review context
- 25-line max per note

## Workflow

Feature branches (`feature/*`) → `development` → `main` after tests pass.
