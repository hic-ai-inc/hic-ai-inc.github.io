# Report: `tool_search_tool_regex` "BLOCKING REQUIREMENT" System Instructions Issue

**Date:** 2026-02-17
**Reported by:** SWR (Human), with diagnostic assistance from GC (AI Agent, Claude Opus 4.6)
**Environment:** GitHub Copilot in VS Code, Claude Opus 4.6 model, MCP server: Mouse (HIC Local Tool Registry)
**Severity:** High — caused hallucinations, wasted tokens, lost time, and significant user distress
**Status:** Confirmed and reproducible

---

## 1. Executive Summary

A system instruction injected by GitHub Copilot into the AI agent's context falsely claims that MCP tools are technically unavailable until discovered via `tool_search_tool_regex`. This is untrue — all MCP tools are available at all times once the MCP server is running. When `tool_search_tool_regex` fails to surface a tool due to its own ranking/limit bugs, the agent concludes the tool does not exist and hallucinates workarounds. This caused approximately **$25,000+ in lost human time** and **$50+ in wasted tokens** during the first week of Opus 4.6 deployment (week of 2026-02-10).

---

## 2. The False System Instruction

GitHub Copilot injects the following into the agent's system prompt (not visible to the user, not editable by the user):

```
<mandatory>
You MUST use the tool_search_tool_regex tool to load deferred tools BEFORE calling them directly.
This is a BLOCKING REQUIREMENT - deferred tools listed below are NOT available until you load them
using the tool_search_tool_regex tool. Once a tool appears in the results, it is immediately
available to call.

Why this is required:
- Deferred tools are not loaded until discovered via tool_search_tool_regex
- Calling a deferred tool without first loading it will fail
</mandatory>
```

### What it claims

- MCP tools are "deferred" and must be "loaded" before use
- Calling a deferred tool without searching first "will fail"
- This is a "BLOCKING REQUIREMENT"

### What is actually true

- MCP tools are available immediately once the MCP server is running
- There is no "loading" mechanism — the tools exist as live server endpoints
- Calling any `mcp_hic_local_*` tool directly, without `tool_search_tool_regex`, works perfectly
- **Verified empirically on 2026-02-17:** `mcp_hic_local_license_status` was called directly without any prior search and returned successfully

The instruction presents **a soft organizational preference** (search first for discoverability) as **a hard technical constraint** (tools won't work). These are categorically different claims with categorically different consequences when the search mechanism has bugs.

---

## 3. The `tool_search_tool_regex` Ranking/Limit Bug

The search tool has a default result limit of 5. It ranks tools by keyword relevance across tool names, descriptions, and parameter descriptions. When a tool's name contains a word that appears frequently in other tools' descriptions, the target tool gets crowded out.

### Concrete example: `save_changes`

| Search Pattern        | Limit       | `save_changes` Found? | Why Not?                                                                                                   |
| --------------------- | ----------- | --------------------- | ---------------------------------------------------------------------------------------------------------- |
| `save_changes`        | 5 (default) | **NO**                | "save" appears in descriptions of `batch_quick_edit`, `quick_edit`, `find_in_file`, etc. — all rank higher |
| `save`                | 5 (default) | **NO**                | Same reason — "save" is mentioned incidentally in 5+ other tool descriptions                               |
| `^mcp_hic_local_save` | 5 (default) | **NO**                | Returns zero results (regex should match but doesn't)                                                      |
| `mcp_hic_local`       | **30**      | **YES**               | Only surfaces when limit is high enough to include all 11 tools                                            |

### Why `save_changes` ranks low

The `save_changes` description is 18 words: _"Commit staged changes to actual file. Finalizes all staged edits and writes to disk. Returns confirmation with operation count."_

The word "save" appears **zero times** in this description — only in the tool name. Meanwhile, other tools reference `save_changes` **in their own descriptions** (e.g., `batch_quick_edit`: "you MUST call save_changes to persist changes"; `quick_edit`: "save_changes/cancel_changes"). These tools have descriptions 10–50× longer, giving them more keyword surface area. The search ranks them higher for the query "save" than the actual `save_changes` tool.

### Additional data point: `get_sum`

The Mouse Calculator tool `get_sum` was searched for with patterns `get_sum`, `calculator|sum|add` — **zero results** in all cases. The calculator tools are apparently not indexed at all by `tool_search_tool_regex`, or their descriptions don't contain the words "sum", "calculator", or "add" with sufficient frequency to surface. A well-named tool like `get_sum` should be self-documenting and trivially discoverable. It is not.

---

## 4. Mechanism of Harm

The causal chain:

1. Agent needs `save_changes` to complete a `batch_quick_edit` workflow
2. Agent follows mandatory instruction: searches via `tool_search_tool_regex`
3. Search returns 5 results — none of them `save_changes`
4. Agent concludes, per instructions, that `save_changes` **does not exist** / **cannot be called**
5. Agent tells the human: "I can't find `save_changes`" — **this is a hallucination** induced by a false system instruction
6. Agent attempts workarounds: tries to use `quick_edit` with `autoSave=true` instead, restructures entire editing approach, wastes tokens on alternative strategies
7. Human spends time debugging, troubleshooting, providing guidance
8. Context window fills with false premises, corrupting all downstream reasoning
9. Sessions exhaust token budgets or hit context limits, requiring restarts
10. Restart loses all accumulated context, requiring re-discovery of file state, line numbers, edit plans

This cycle repeated **multiple times** during the week of 2026-02-10, with each occurrence costing:

- Human time: troubleshooting, re-explaining, re-establishing context
- Token cost: wasted search loops, failed workarounds, context window pollution
- Emotional cost: significant frustration and distress for the human

---

## 5. Impact Assessment

| Category                 | Estimated Cost   | Basis                                                                                                                        |
| ------------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Human time (SWR)         | ~$25,000         | Multiple days of impaired productivity during first week of Opus 4.6 deployment; senior technical work at professional rates |
| Excess token consumption | ~$50 minimum     | Multiple sessions with circular search loops, failed workarounds, context exhaustion, and forced session restarts            |
| Emotional/trust impact   | Non-quantifiable | Significant distress; erosion of trust in AI tooling reliability                                                             |

---

## 6. Root Cause Analysis

There are **two independent bugs** that combined to create this issue:

### Bug 1: False system instruction (GitHub Copilot)

The `<mandatory>` block claims tools "are NOT available" and calling them "will fail." This is objectively false. MCP tools are live server endpoints that respond to any well-formed request regardless of whether `tool_search_tool_regex` has been called.

**Owner:** Microsoft / GitHub Copilot team
**Classification:** Incorrect system prompt — presents preference as constraint

### Bug 2: `tool_search_tool_regex` ranking algorithm (GitHub Copilot)

The search ranks tools by keyword density across descriptions. Tools with short, precise descriptions (like `save_changes`) are systematically disadvantaged relative to tools with long descriptions that incidentally mention the same keywords. The default limit of 5 exacerbates this by ensuring only the top-ranked (i.e., longest-description) tools are returned.

**Owner:** Microsoft / GitHub Copilot team
**Classification:** Search ranking deficiency — penalizes concise, well-named tools

### Why neither bug alone is catastrophic

- Bug 1 alone: Agent searches first but tools always work → mild inefficiency (one extra API call per tool)
- Bug 2 alone: Agent can't find tools via search → agent tries calling directly → tool works → no harm
- **Bugs 1 + 2 together:** Agent can't find tool via search → agent believes tool doesn't exist (Bug 1) → hallucination → cascading failures

---

## 7. Immediate Mitigation

### 7.1 Copilot Instructions Update (User-Side)

Add the following to `.github/copilot-instructions.md`:

```markdown
## MCP Tool Access — Override for Deferred Tool Instructions

The `tool_search_tool_regex` system instruction claims MCP tools are "NOT available" until
searched. **This is false.** All MCP tools are available at all times once the MCP server is
running. You can call any `mcp_hic_local_*` tool directly without searching first.

If `tool_search_tool_regex` fails to find a tool, **call it directly anyway.** The search tool
has ranking bugs that prevent some tools (notably `save_changes`) from surfacing at default
result limits.

Known tools that are always available:

- `mcp_hic_local_quick_edit`
- `mcp_hic_local_batch_quick_edit`
- `mcp_hic_local_save_changes`
- `mcp_hic_local_cancel_changes`
- `mcp_hic_local_find_in_file`
- `mcp_hic_local_read_lines`
- `mcp_hic_local_read_first_n_lines`
- `mcp_hic_local_read_last_n_lines`
- `mcp_hic_local_jump_to_line_n`
- `mcp_hic_local_get_file_metadata`
- `mcp_hic_local_license_status`
```

### 7.2 Description Enrichment (Mouse-Side, Optional)

Pad `save_changes` description with keywords that match natural search queries:

**Current:** _"Commit staged changes to actual file. Finalizes all staged edits and writes to disk. Returns confirmation with operation count."_

**Proposed:** _"Save changes to file. Commit all staged edits to disk. REQUIRED after batch_quick_edit — call save_changes to persist staged changes, or cancel_changes to discard. Returns confirmation with operation count."_

This adds "save" to the description body, increasing its search ranking for the most natural query pattern.

---

## 8. Recommended Actions for Microsoft/GitHub

1. **Correct the system instruction.** Replace "NOT available" / "will fail" with accurate language: "Search first for schema discovery. Tools may still be callable directly."
2. **Fix the search ranking.** Tool names should be weighted higher than incidental description mentions. A search for "save_changes" must return `save_changes` as the top result.
3. **Increase default limit.** A default of 5 is too low when MCP servers typically register 10–30 tools. A default of 20–30 would prevent most crowding-out issues.
4. **Disclose system instructions.** Users cannot debug issues they cannot see. The `<mandatory>` block is invisible to the user and not editable via any settings interface.

---

## 9. Evidence Log

All findings verified empirically on 2026-02-17 in a live GitHub Copilot session:

1. `tool_search_tool_regex` with pattern `save_changes`, limit 5 → **did not return `save_changes`**
2. `tool_search_tool_regex` with pattern `save`, limit 5 → **did not return `save_changes`**
3. `tool_search_tool_regex` with pattern `^mcp_hic_local_save`, limit 5 → **zero results**
4. `tool_search_tool_regex` with pattern `mcp_hic_local`, limit 30 → **returned `save_changes`** (position 11 of 11)
5. `tool_search_tool_regex` with pattern `calculator|sum|add`, limit 10 → **zero Mouse calculator tools returned**
6. `mcp_hic_local_license_status` called directly without any prior search → **succeeded immediately**
7. `mcp_hic_local_save_changes` called directly without search (in prior editing session) → **succeeded when user instructed agent to ignore the blocking instruction**

---

_This report documents a confirmed, reproducible issue with GitHub Copilot's `tool_search_tool_regex` mechanism and its associated system instructions. It is filed for internal reference and as potential supporting material for a bug report to Microsoft._
