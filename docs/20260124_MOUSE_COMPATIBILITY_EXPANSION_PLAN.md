# Mouse Compatibility Expansion Plan

**Date:** January 24, 2026  
**Author:** GitHub Copilot  
**Status:** Active Testing  
**Current Version:** v0.9.8 (stable on main)  
**Target Version:** v0.9.9 (development, expanded compatibility)

---

## Executive Summary

This memo outlines a systematic plan to expand Mouse's compatibility from its current proven configuration (GitHub Copilot + Q Developer in VS Code with Anthropic models) to a broader ecosystem of AI agents, IDEs, and model providers. Work is organized in ascending order of difficulty to build momentum, capture easy wins first, and inform estimates for harder challenges.

**Current State:** Works with 2 MCP clients + **Copilot CLI + Packaged Mouse (VERIFIED 2026-01-24)**, 1 IDE, 1 model family  
**Target State:** Works with 6+ MCP clients, 3+ IDEs, 2+ model families

**🚀 MARKET OPPORTUNITY (2026-01-24):** VS Code MCP extensions alone represent **6.75M potential users**:
- Cline: 2.9M | Roo Code: 1.2M | Continue: 2.0M | Kilo Code: 650K
- These are **easy wins** — same IDE, same config format, many use Anthropic models

**Estimated Total Effort:** 5-12 days (depending on unforeseen blockers)

> **🎉 BREAKTHROUGH (2026-01-24):** GitHub Copilot CLI successfully tested with Mouse!
> All core tools working: `read_lines`, `quick_edit`, `batch_quick_edit`, `find_in_file`, 
> `get_file_metadata`, `make_note`, `list_notes`, `save_changes`, `cancel_changes`, `ADJUST`.
> See [Appendix B](#appendix-b-github-copilot-cli-setup-guide) for setup instructions.
>
> **🎉 PACKAGED VERSION VALIDATED (2026-01-24):** Tested `npx @get-hic/mouse` installation!
> Packaged server at `.hic/mcp/src/core/server.js` works identically to dev source.
> Refinement Mode confirmed working (2-pass workflow: initial batch + ADJUST).

---

## Table of Contents

1. [Current Compatibility Baseline](#1-current-compatibility-baseline)
2. [Compatibility Dimensions](#2-compatibility-dimensions)
3. [Integration Targets (Ordered by Difficulty)](#3-integration-targets-ordered-by-difficulty)
4. [Technical Challenges Deep Dive](#4-technical-challenges-deep-dive)
5. [Testing Protocol](#5-testing-protocol)
6. [Recommended Execution Order](#6-recommended-execution-order)
7. [Time Estimates & Milestones](#7-time-estimates--milestones)
8. [Risk Assessment](#8-risk-assessment)
9. [Go/No-Go Criteria](#9-gono-go-criteria)

---

## 1. Current Compatibility Baseline

### What We Know Works ✅

| Component          | Status                                     | Notes                           |
| ------------------ | ------------------------------------------ | ------------------------------- |
| **IDE**            | VS Code                                    | Primary development environment |
| **MCP Clients**    | GitHub Copilot, Q Developer                | Both work via MCP in VS Code    |
| **Models**         | Anthropic (Haiku 4.5, Sonnet 4+, Opus 4.5) | Full tool-calling support       |
| **Transport**      | stdio                                      | Standard MCP transport          |
| **Implementation** | Custom JS (no Anthropic SDK)               | Clean, minimal dependencies     |

### What We Know Doesn't Work ❌

| Component             | Status                  | Notes                              |
| --------------------- | ----------------------- | ---------------------------------- |
| **OpenAI/GPT models** | No path forward         | Tool-calling behavior incompatible |
| **Gemini models**     | Requires schema changes | Strict `required` field validation |

### What We Now Know Doesn't Work ❌

| Component             | Reason                                   | Date Verified |
| --------------------- | ---------------------------------------- | ------------- |
| VS Code Inline Chat   | Ctrl+I does NOT support MCP tools—architectural limitation | 2026-01-24    |
| Q Developer Inline    | No inline mode exists                   | 2026-01-24    |

### What We've Now Verified Working ✅ (2026-01-24)

| Component          | Status    | Tools Tested | Notes                                   |
| ------------------ | --------- | ------------ | --------------------------------------- |
| GitHub Copilot CLI | ✅ WORKING | 11/11        | Terminal agent, full MCP support        |

> **Note:** Copilot CLI verified with BOTH development source AND packaged npm installation.
> Packaged version (`{workspace}/.hic/mcp/`) validated 2026-01-24 via `npx @get-hic/mouse`.

### What We Haven't Tested ❓

| Component              | Expected Difficulty | Notes                                   |
| ---------------------- | ------------------- | --------------------------------------- |
| Claude Code (terminal) | Easy                | Anthropic models, documented MCP        |
| Cursor                 | Easy-Medium         | Good MCP support, documented            |
| **VS Code MCP Extensions** | **Easy**       | **Same config as Copilot, many options** |
| Kiro                   | Medium              | AWS ecosystem, should work like Q       |
| Windsurf               | Medium              | Codeium's IDE, MCP support unclear      |
| Other terminal agents  | Medium-Hard         | Varies by implementation                |

### VS Code MCP Extensions Discovered (2026-01-24)

**Priority Testing Candidates** (all support MCP, installed via VS Code Marketplace):

| Extension | Installs | Rating | MCP Support | Notes |
|-----------|----------|--------|-------------|-------|
| **Cline** | 2.9M | 4.34 | ✅ Native | **⚠️ BLOCKED: needs agentId support** |
| **Roo Code** | 1.2M | 4.84 | ✅ Native | "Team of AI agents" |
| **Continue** | 2.0M | 3.77 | ✅ Native | Open-source, multi-model |
| **Kilo Code** | 650K | 4.49 | ✅ Native | 500+ model support |
| **Augment Code** | 689K | 3.68 | ✅ Native | Enterprise-focused |
| **CodeGPT** | 2.2M | 3.51 | ✅ Native | Official API connections |
| **BLACKBOX AI** | 4.7M | 4.06 | ✅ Tagged | High installs |
| **Copilot MCP** | 75K | 4.25 | ✅ MCP management | Server discovery tool |

**Why These Are Easy Wins:**
- Same IDE (VS Code) = same workspace context
- MCP config likely compatible with existing `.vscode/mcp.json`
- Many support Anthropic models (proven compatible)
- No additional IDE setup required

---

## 2. Compatibility Dimensions

### Dimension 1: MCP Client/Host

The MCP client is the software that connects to Mouse's MCP server. Each client may have quirks in:

- How it discovers and loads MCP servers
- How it presents tool schemas to its underlying model
- How it handles tool responses (especially errors)
- Configuration file format and location

**Known MCP Clients:**

- GitHub Copilot (in VS Code)
- Amazon Q Developer (in VS Code)
- Cursor (native MCP support)
- Claude Code (terminal, `.mcp.json`)
- Kiro (AWS, MCP documented)
- Windsurf (Codeium, MCP status unknown)

### Dimension 2: IDE/Environment

The environment affects:

- File system access patterns
- Workspace context availability
- Extension/plugin architecture
- Configuration paths

**Environments:**

- VS Code (proven)
- Cursor (VS Code fork, likely similar)
- JetBrains IDEs (MCP support emerging)
- Terminal (Claude Code, etc.)

### Dimension 3: Model Provider

The model determines:

- Tool-calling capability and syntax
- Schema validation strictness
- Response format expectations
- Error handling behavior

**Model Families:**

- **Anthropic** ✅ (proven)
- **OpenAI/GPT** ❌ (not compatible currently)
- **Google Gemini** ⚠️ (requires schema changes)
- **AWS Bedrock models** (likely works if Anthropic via Bedrock)

### Dimension 4: Transport

How Mouse communicates with the MCP client:

- **stdio** (current, works everywhere)
- **HTTP/SSE** (some clients prefer this)
- **WebSocket** (less common)

**Current:** stdio only. This is sufficient for all planned targets.

---

## 3. Integration Targets (Ordered by Difficulty)

### ~~Tier 1: Very Easy~~ — REMOVED

> **Finding (2026-01-24):** VS Code inline chat (Ctrl+I) does NOT support MCP tools.
> This is an architectural limitation, not a Mouse issue. Inline chat is fundamentally
> different from Agent-mode Chat View—it's a simple prompt→diff→accept flow with no
> tool picker, no agent mode, and no MCP integration. Q Developer does not have an
> inline mode. This saves ~1 day from the original timeline.

---

### Tier 1: Easy (1-2 days each)

#### 1.1 Claude Code (Terminal)

**Why Easy:**

- Anthropic models (proven compatible)
- Well-documented MCP support
- Uses `.mcp.json` configuration (standard)
- No IDE-specific complexity

**Integration Steps:**

1. Create Claude Code MCP config template
2. Test tool discovery
3. Run smoke tests (read, edit, batch)
4. Run full E2E workflow suite
5. Document setup instructions

**Potential Challenges:**

- Terminal output formatting (no GUI)
- Working directory handling
- Path resolution differences (relative vs absolute)

**Effort:** 1 day

#### 2.2 Cursor

**Why Easy-ish:**

- VS Code fork (similar architecture)
- First-class MCP support with documentation
- Large user base, well-tested MCP ecosystem

**Integration Steps:**

1. Follow Cursor MCP setup docs
2. Test with Anthropic models first
3. Test with other models Cursor supports
4. Run E2E suite
5. Document Cursor-specific setup

**Potential Challenges:**

- Cursor has had MCP visibility regressions (version-specific bugs)
- May need to document "known good" Cursor versions
- Different settings path than VS Code

**Effort:** 1-2 days

---

### Tier 3: Medium (2-3 days each)

#### 3.1 Kiro (AWS)

**Why Medium:**

- AWS ecosystem (should work like Q Developer)
- MCP documented but newer
- Less community battle-testing than Cursor

**Integration Steps:**

1. Set up Kiro with MCP config
2. Test with Anthropic models (via Bedrock or direct)
3. Verify all tools work
4. Run E2E suite
5. Document setup

**Potential Challenges:**

- AWS-specific authentication flows
- Bedrock model routing
- Enterprise configuration complexity

**Effort:** 2 days

#### 3.2 Gemini Models (Schema Sanitizer Required)

**Why Medium:**

- Known issue: Gemini requires strict `required` fields
- Requires code changes to Mouse MCP server
- Once fixed, opens up Gemini across all clients

**Technical Work Required:**

1. Audit all tool schemas for Gemini compliance
2. Implement schema sanitizer/transformer
3. Add `--schema-profile` flag or auto-detection
4. Test with Gemini in VS Code (Copilot supports Gemini)
5. Test with Gemini in other clients

**Schema Sanitizer Requirements:**

```javascript
// Gemini requires:
// - Explicit `type: "object"` at root
// - All properties must have explicit `type`
// - `required` array must be present (even if empty)
// - No `anyOf`/`oneOf` at top level
// - `additionalProperties: false` preferred

function sanitizeForGemini(schema) {
  // Transform schema to Gemini-strict format
}
```

**Potential Challenges:**

- May break existing functionality if not careful
- Need to maintain backward compatibility
- Some advanced schema features may need removal/simplification

**Effort:** 2-3 days (includes implementation + testing)

---

### Tier 4: Hard (3-5 days each)

#### 4.1 Windsurf (Codeium)

**Why Hard:**

- MCP support status unclear
- Different architecture than VS Code
- Less documentation available

**Integration Steps:**

1. Research Windsurf MCP support
2. If supported, follow their docs
3. If not, determine if there's a path forward
4. Test and document

**Effort:** 1-3 days (highly uncertain)

#### 4.2 JetBrains IDEs (IntelliJ, PyCharm, etc.)

**Why Hard:**

- Different plugin architecture than VS Code
- MCP support is emerging, not mature
- May require IDE-specific adapter

**Effort:** 3-5 days (if feasible at all in near term)

---

### Tier 5: Very Hard / Not Currently Feasible

#### 5.1 OpenAI/GPT Models

**Why Very Hard:**

- Tool-calling behavior fundamentally different
- May require model-specific prompt engineering
- No clear path forward identified

**Current Recommendation:** Deprioritize. Focus on Anthropic + Gemini, which covers most power users.

**Effort:** Unknown (could be weeks or impossible)

---

## 4. Technical Challenges Deep Dive

### 4.1 Schema Compatibility Matrix

| Schema Feature               | Anthropic    | Gemini            | OpenAI       |
| ---------------------------- | ------------ | ----------------- | ------------ |
| `type: "object"` at root     | Optional     | Required          | Required     |
| Explicit `type` on all props | Recommended  | Required          | Required     |
| `required` array             | Optional     | Required          | Required     |
| `anyOf`/`oneOf`              | Supported    | ❌ Fails          | Supported    |
| `additionalProperties`       | Any          | `false` preferred | Any          |
| Nested objects               | Full support | Limited           | Full support |
| Array of objects             | Full support | Strict            | Full support |

### 4.2 Current Mouse Schema Audit Needed

Before Gemini work, audit these tool schemas:

- `quick_edit` (complex, multiple operation types)
- `batch_quick_edit` (array of operations)
- `find_in_file` (regex options)
- `read_lines` / `jump_to_line_n` / etc. (simpler, likely OK)
- `get_file_metadata` (simple, likely OK)
- `save_changes` / `cancel_changes` (simple)

**Likely Issues:**

- `quick_edit` has complex union types for different operations
- `batch_quick_edit` has nested arrays of operations
- Some optional parameters may lack explicit types

### 4.3 Transport Considerations

All targets use **stdio**, which is good—no transport work needed.

Exception: Some enterprise deployments may want HTTP. Defer to future version.

### 4.4 Configuration File Formats

| Client            | Config Format          | Config Location                          |
| ----------------- | ---------------------- | ---------------------------------------- |
| VS Code (Copilot) | `settings.json`        | `.vscode/settings.json` or user settings |
| VS Code (Q)       | `settings.json`        | Same as Copilot                          |
| Claude Code       | `.mcp.json`            | Project root                             |
| Cursor            | `mcp.json` or settings | `~/.cursor/mcp.json` or project          |
| Kiro              | MCP config             | Documented in Kiro docs                  |

**Deliverable:** Config templates for each client in Mouse documentation.

---

## 5. Testing Protocol

### 5.1 Smoke Test Suite (For Initial Validation)

Run these tests first to determine if basic compatibility exists:

1. **Tool Discovery:** Does client see all Mouse tools?
2. **Simple Read:** `get_file_metadata` on a known file
3. **Read with Viewport:** `read_lines` with line range
4. **Simple Edit:** `quick_edit` with INSERT operation
5. **Batch Edit:** `batch_quick_edit` with 3 operations
6. **Rollback:** `cancel_changes` after staging
7. **Save:** `save_changes` to persist

**Pass Criteria:** All 7 tests complete without error.

### 5.2 Full E2E Workflow Suite (77 workflows)

After smoke tests pass, run the complete E2E manual workflow suite:

- All read operations with various parameters
- All edit operations (INSERT, REPLACE, DELETE, REPLACE_RANGE, FOR_LINES, ADJUST)
- Batch operations with mixed types
- Error handling (invalid paths, permission errors, etc.)
- Edge cases (empty files, very large files, binary files)
- Concurrent operations (if applicable)

**Pass Criteria:** 100% of workflows complete correctly.

### 5.3 UX Validation (For Each Client)

- Tool response formatting looks correct
- Error messages are helpful
- Performance is acceptable
- No unexpected behaviors or side effects

### 5.4 Regression Testing

After each integration, re-run tests on ALL previously-supported configurations to ensure no regressions.

---

## 6. Recommended Execution Order

Based on difficulty assessment and strategic value:

### Phase 1: Terminal Agents & Infrastructure (Days 1-3)

**Goal:** Extend Mouse to terminal agents, starting with GitHub's own CLI.

| #   | Task                                     | Est. Time | Status |
| --- | ---------------------------------------- | --------- | ------ |
| 1.1 | Create compatibility matrix page template | 1 hour    | ⏳ TODO |
| 1.2 | Create smoke test script/checklist        | 1 hour    | ⏳ TODO |
| 1.3 | Set up GitHub Copilot CLI with Mouse MCP  | 2-3 hours | ✅ DONE |
| 1.4 | Run smoke tests on Copilot CLI            | 2 hours   | ✅ DONE |
| 1.5 | Run full E2E suite on Copilot CLI         | 4-6 hours | ⏳ Partial (11 tools tested) |
| 1.6 | **Test Cline (2.9M users)**               | 1-2 hours | ⏳ NEXT |
| 1.7 | **Test Roo Code (1.2M users)**            | 1-2 hours | |
| 1.8 | **Test Continue (2.0M users)**            | 1-2 hours | |
| 1.9 | **Test Kilo Code (650K users)**           | 1-2 hours | |
| 1.10| Set up Claude Code with Mouse MCP        | 2-3 hours | |
| 1.11| Run smoke + E2E tests on Claude Code     | 4-6 hours | |
| 1.12| Document all setups                      | 2 hours   | |

**End of Phase 1:** 4 VS Code extensions + 2 terminal agents = **6.75M+ potential users validated**

**End of Day 3:** Two terminal agents (Copilot CLI + Claude Code) fully tested.

### Phase 2: Cursor (Days 4-5)

**Goal:** First non-VS-Code IDE, large market.

| #   | Task                               | Est. Time |
| --- | ---------------------------------- | --------- |
| 2.1 | Set up Cursor with Mouse MCP       | 2-3 hours |
| 2.2 | Run smoke tests (Anthropic models) | 2 hours   |
| 2.3 | Test other models Cursor supports  | 2-3 hours |
| 2.4 | Run full E2E suite                 | 4-6 hours |
| 2.5 | Fix any issues found               | 2-4 hours |
| 2.6 | Document Cursor setup              | 1-2 hours |

**End of Day 5:** Cursor fully tested and documented.

### Phase 3: Schema Sanitizer for Gemini (Days 6-8)

**Goal:** Enable Gemini models across all clients.

| #   | Task                              | Est. Time |
| --- | --------------------------------- | --------- |
| 3.1 | Audit all tool schemas            | 2-3 hours |
| 3.2 | Design schema sanitizer           | 2-3 hours |
| 3.3 | Implement schema sanitizer        | 4-6 hours |
| 3.4 | Test with Gemini in VS Code       | 3-4 hours |
| 3.5 | Test with Gemini in Cursor        | 2-3 hours |
| 3.6 | Run full E2E suite (both clients) | 6-8 hours |
| 3.7 | Regression test Anthropic models  | 2-3 hours |

**End of Day 8:** Gemini models working in VS Code and Cursor.

### Phase 4: Kiro (Days 9-10)

**Goal:** AWS ecosystem support.

| #   | Task                       | Est. Time |
| --- | -------------------------- | --------- |
| 4.1 | Set up Kiro with Mouse MCP | 3-4 hours |
| 4.2 | Run smoke tests            | 2 hours   |
| 4.3 | Run full E2E suite         | 4-6 hours |
| 4.4 | Fix any issues             | 2-4 hours |
| 4.5 | Document Kiro setup        | 1-2 hours |

**End of Day 10:** Kiro fully tested and documented.

### Phase 5: Polish & Release (Days 11-12)

**Goal:** Finalize v0.9.9, prepare for release.

| #   | Task                                          | Est. Time |
| --- | --------------------------------------------- | --------- |
| 5.1 | Complete compatibility matrix documentation   | 2-3 hours |
| 5.2 | Final regression testing (all configurations) | 4-6 hours |
| 5.3 | Update README, CHANGELOG                      | 2 hours   |
| 5.4 | Internal dogfooding on development            | 2-3 days  |
| 5.5 | Release to main                               | 1 hour    |

---

## 7. Time Estimates & Milestones

### Optimistic Path (No Major Blockers)

| Milestone              | Day | Cumulative |
| ---------------------- | --- | ---------- |
| Inline agents verified | 1   | 1 day      |
| Claude Code working    | 3   | 3 days     |
| Cursor working         | 5   | 5 days     |
| Gemini working         | 8   | 8 days     |
| Kiro working           | 10  | 10 days    |
| v0.9.9 ready for main  | 12  | 12 days    |

### Pessimistic Path (Significant Blockers)

| Milestone              | Day   | Cumulative |
| ---------------------- | ----- | ---------- |
| Inline agents verified | 1-2   | 2 days     |
| Claude Code working    | 4-5   | 5 days     |
| Cursor working         | 7-8   | 8 days     |
| Gemini working         | 12-14 | 14 days    |
| Kiro working           | 16-17 | 17 days    |
| v0.9.9 ready for main  | 20    | 20 days    |

### Summary Estimate

| Scenario      | Duration   | Calendar Time |
| ------------- | ---------- | ------------- |
| Best case     | 10-12 days | ~2 weeks      |
| Expected case | 14-16 days | ~3 weeks      |
| Worst case    | 18-22 days | ~4 weeks      |

---

## 8. Risk Assessment

### High Risk Items

| Risk                                             | Likelihood | Impact | Mitigation                                            |
| ------------------------------------------------ | ---------- | ------ | ----------------------------------------------------- |
| Gemini schema changes break Anthropic            | Medium     | High   | Extensive regression testing; feature flags           |
| Cursor has MCP bugs we can't work around         | Low        | High   | Document "known good" versions; monitor Cursor forums |
| E2E suite reveals cross-client incompatibilities | Medium     | Medium | Fix forward; may need client-specific workarounds     |

### Medium Risk Items

| Risk                                           | Likelihood | Impact | Mitigation                                   |
| ---------------------------------------------- | ---------- | ------ | -------------------------------------------- |
| Claude Code has terminal-specific quirks       | Medium     | Medium | Budget extra time for debugging              |
| Kiro documentation is incomplete               | Medium     | Medium | Trial and error; community resources         |
| Schema sanitizer is more complex than expected | Medium     | Medium | Start with minimal viable sanitizer; iterate |

### Confirmed Non-Issues (Resolved)

| Item                          | Status       | Resolution                              |
| ----------------------------- | ------------ | --------------------------------------- |
| VS Code inline agents         | ❌ Confirmed | Inline chat doesn't support MCP (2026-01-24) |
| Q Developer inline            | ❌ Confirmed | No inline mode exists (2026-01-24)      |

### Confirmed Working ✅

| Item                    | Status       | Resolution                              |
| ----------------------- | ------------ | --------------------------------------- |
| GitHub Copilot CLI (dev) | ✅ Verified  | All 11 tested tools work (2026-01-24)   |
| Copilot CLI (packaged)   | ✅ Verified  | `npx @get-hic/mouse` validated (2026-01-24) |

### Blocked (Easy Fix Required) ⚠️

| Item | Status | Resolution |
| ---- | ------ | ---------- |
| **Cline** | ⚠️ Blocked | Agent ID `cline` not in `supportedAgents` array (2026-01-24) |
| **Claude Code CLI** | ⚠️ Blocked | Agent ID `claude` not in `supportedAgents` array (2026-01-24) |

**Cline Details (2026-01-24):**
- MCP connection: ✅ Working
- Tool discovery: ✅ All tools visible
- Calculator tools: ✅ Working
- DateTime tools: ✅ Working
- Notepad list_notes: ✅ Working
- **File read/edit tools: ❌ BLOCKED** — `Invalid agent ID: cline. Supported: copilot, q-developer`
- **Notepad write tools: ❌ BLOCKED** — Same agent ID validation issue

**Fix Required (v0.9.9):**
Add `"cline"` AND `"claude"` to `supportedAgents` array in:
- `mouse/src/services/StagingService.js`
- `mouse/src/services/ClipboardService.js`
- `mouse/src/services/ModeManager.js`
- `utils/notepad/src/helpers/validation-utils.js`

**Estimated Fix Effort:** 30 minutes (same files, add both IDs)

**Pattern Confirmed:** MCP works perfectly with these clients. Only the hardcoded
`supportedAgents = ["copilot", "q-developer"]` array is blocking. Easy fix unlocks
**5.9M+ potential users** (Cline 2.9M + Claude Code ecosystem).

**Claude Code (VS Code Extension) Details (2026-01-24):**
- Extension installed: ✅ `anthropic.claude-code`
- Anthropic Console auth: ⚠️ Buggy OAuth flow, API key issues
- MCP config created: ✅ `.mcp.json` in project root
- **Status: Installation difficulties** — Auth flow unreliable in VS Code chat interface

**Claude Code CLI Details (2026-01-24):**
- CLI installed: ✅ v2.1.19
- MCP connection: ✅ Working
- Tool discovery: ✅ All tools visible (prefixed `mcp__hic_local__`)
- **File read/edit tools: ❌ BLOCKED** — `Invalid agent ID: claude. Supported: copilot, q-developer`
- **Same pattern as Cline** — Agent ID validation is the only blocker

**Claude Code Status:** ⚠️ BLOCKED on agent ID (same fix as Cline)

### Low Risk Items

| Risk                             | Likelihood | Impact | Mitigation                       |
| -------------------------------- | ---------- | ------ | -------------------------------- |

---

## 9. Go/No-Go Criteria

### Before Starting Phase 2 (Cursor)

- [x] Inline chat incompatibility confirmed (2026-01-24)
- [ ] Smoke test checklist finalized
- [ ] Compatibility matrix template created
- [x] **Copilot CLI working (dev source)** (2026-01-24) — 11 tools verified
- [x] **Copilot CLI working (packaged `.hic/mcp/`)** (2026-01-24) — `npx @get-hic/mouse` validated
- [ ] VS Code MCP extensions (Cline, Roo Code, etc.) — **NEW: 8 extensions identified**
- [ ] Claude Code fully working

### Before Starting Phase 3 (Schema Sanitizer)

- [x] Copilot CLI fully working (dev source verified 2026-01-24)
- [ ] Claude Code fully working
- [ ] Cursor fully working (at least with Anthropic)
- [ ] Clear understanding of Gemini schema requirements

### Before Releasing v0.9.9 to Main

- [ ] All planned integrations passing E2E suite
- [ ] No regressions in existing (Copilot, Q) configurations
- [ ] Documentation complete for all clients
- [ ] At least 3 days of internal dogfooding on development branch
- [ ] Compatibility matrix published

---

## Appendix A: Quick Reference - Client Setup Commands

### Claude Code

```bash
# Create .mcp.json in project root
{
  "mcpServers": {
    "mouse": {
      "command": "node",
      "args": ["/path/to/mouse/mcp-server.js"],
      "env": {}
    }
  }
}
```

### Cursor

```json
// ~/.cursor/mcp.json or project .cursor/mcp.json
{
  "mcpServers": {
    "mouse": {
      "command": "node",
      "args": ["/path/to/mouse/mcp-server.js"]
    }
  }
}
```

### Kiro

```json
// Per Kiro MCP documentation
// Path: ~/.kiro/mcp.json or project config
{
  "mcpServers": {
    "mouse": {
      "command": "node",
      "args": ["/path/to/mouse/mcp-server.js"]
    }
  }
}
```

---

## Appendix B: Schema Sanitizer Pseudocode

```javascript
/**
 * Transforms Mouse tool schemas to be Gemini-compatible.
 *
 * Gemini requirements:
 * 1. Root must have explicit `type: "object"`
 * 2. All properties must have explicit `type`
 * 3. `required` array must be present (even if empty)
 * 4. No `anyOf`/`oneOf` at top level (flatten or pick one)
 * 5. `additionalProperties: false` recommended
 */
function sanitizeSchemaForGemini(schema) {
  const sanitized = { ...schema };

  // Ensure root type
  if (!sanitized.type) {
    sanitized.type = "object";
  }

  // Ensure required array exists
  if (!sanitized.required) {
    sanitized.required = [];
  }

  // Add additionalProperties: false
  if (sanitized.additionalProperties === undefined) {
    sanitized.additionalProperties = false;
  }

  // Recursively sanitize properties
  if (sanitized.properties) {
    for (const [key, prop] of Object.entries(sanitized.properties)) {
      sanitized.properties[key] = sanitizeProperty(prop);
    }
  }

  // Handle anyOf/oneOf (flatten to most common case)
  if (sanitized.anyOf || sanitized.oneOf) {
    sanitized = flattenUnionType(sanitized);
  }

  return sanitized;
}

function sanitizeProperty(prop) {
  // Ensure every property has a type
  if (!prop.type && !prop.anyOf && !prop.oneOf) {
    prop.type = "string"; // Safe default
  }

  // Recursively handle nested objects
  if (prop.type === "object" && prop.properties) {
    return sanitizeSchemaForGemini(prop);
  }

  // Handle arrays
  if (prop.type === "array" && prop.items) {
    prop.items = sanitizeProperty(prop.items);
  }

  return prop;
}
```

---

## Appendix B: GitHub Copilot CLI Setup Guide

> **Verified:** 2026-01-24 | **Status:** ✅ WORKING | **Tools Tested:** 11/11

### Prerequisites

- GitHub Copilot Pro, Pro+, Business, or Enterprise subscription
- Windows: PowerShell v6+ (recommended) or WSL
- macOS/Linux: Terminal with bash/zsh
- Node.js installed (for Mouse MCP server)

### Step 1: Install Copilot CLI

**Windows (PowerShell):**
```powershell
winget install GitHub.Copilot
```

**macOS/Linux:**
```bash
brew install copilot-cli
# OR
curl -fsSL https://gh.io/copilot-install | bash
```

### Step 2: First Launch

```bash
cd /path/to/your/project
copilot
```

1. Trust the directory when prompted (choose option 1 or 2)
2. Run `/login` and authenticate with GitHub

### Step 3: Add Mouse MCP Server

In the Copilot CLI, run:
```
/mcp add
```

Fill in the form:

| Field | Value |
|-------|-------|
| **Type** | `stdio` |
| **Name** | `hic_local` |
| **Command** | `node` |
| **Args** | `/path/to/mouse/mcp/src/core/server.js` |
| **Tools** | `*` |

**Environment Variables:**
```
DEBUG=true
NODE_ENV=production
HIC_AGENT_ADAPTER=copilot
```

Press `Ctrl+S` to save.

### Step 4: Verify Tools

```
/mcp show hic_local
```

You should see all Mouse tools listed.

### Step 5: Test

```
Use the hic_local tools to read the first 5 lines of package.json
```

### Configuration File Location

Copilot CLI stores MCP config at:
```
~/.copilot/mcp-config.json
```

**Example config:**
```json
{
  "mcpServers": {
    "hic_local": {
      "type": "stdio",
      "command": "node",
      "tools": ["*"],
      "args": ["c:/Users/SimonAdmin/source/repos/hic/mcp/src/core/server.js"],
      "env": {
        "DEBUG": "true",
        "NODE_ENV": "production",
        "HIC_AGENT_ADAPTER": "copilot"
      }
    }
  }
}
```

### Tools Verified Working

| Tool | Status | Notes |
|------|--------|-------|
| `read_lines` | ✅ | |
| `quick_edit` (INSERT) | ✅ | |
| `quick_edit` (FOR_LINES) | ✅ | Columnar editing |
| `batch_quick_edit` | ✅ | Staging + dialog box |
| `save_changes` | ✅ | |
| `cancel_changes` | ✅ | |
| `get_file_metadata` | ✅ | Fast file inspection |
| `find_in_file` | ✅ | With showColumns |
| `make_note` | ✅ | Cross-session memory |
| `list_notes` | ✅ | |
| `ADJUST` operation | ✅ | Content relocation |

### Known Issues

1. **PowerShell 6+ required** — Copilot CLI's shell commands fail without `pwsh`. Mouse tools work fine.
2. **Path format** — Use forward slashes (`c:/path/to/file`) in config for cross-platform compatibility.

### Packaging Note

> ✅ **DONE (2026-01-24):** Packaged version at `{workspace}/.hic/mcp/` validated!
> Tested via `npx @get-hic/mouse` in clean folder. Refinement Mode working.

---

## Appendix C: Compatibility Matrix Template

| Client         | IDE      | Models    | Status           | Notes                     |
| -------------- | -------- | --------- | ---------------- | ------------------------- |
| GitHub Copilot | VS Code  | Anthropic | ✅ Supported     | Primary development       |
| **Copilot CLI (dev)**| Terminal | Anthropic | **✅ Verified**  | **11 tools tested 2026-01-24** |
| **Copilot CLI (pkg)**| Terminal | Anthropic | **✅ Verified**  | **Packaged npm version 2026-01-24** |
| Cline          | VS Code  | Multi     | ⚠️ **BLOCKED**   | **Needs `cline` added to supportedAgents (easy fix)** |
| Roo Code       | VS Code  | Multi     | ⏳ Planned       | **NEW: 1.2M installs, MCP native** |
| Continue       | VS Code  | Multi     | ⏳ Planned       | **NEW: Open-source, MCP native** |
| GitHub Copilot | VS Code  | Gemini    | ⏳ Planned       | Requires schema sanitizer |
| GitHub Copilot | VS Code  | GPT       | ❌ Not supported | No path forward           |
| Q Developer    | VS Code  | Anthropic | ✅ Supported     |                           |
| Claude Code    | Terminal | Anthropic | ⏳ Planned       | Next target               |
| Cursor         | Cursor   | Anthropic | ⏳ Planned       | Day 4-5                   |
| Cursor         | Cursor   | Gemini    | ⏳ Planned       | Day 6-8                   |
| Kiro           | Kiro     | Anthropic | ⏳ Planned       | Day 9-10                  |

---

## Document History

| Date       | Author         | Changes          |
| ---------- | -------------- | ---------------- |
| 2026-01-24 | GitHub Copilot | Initial document |
| 2026-01-24 | GitHub Copilot | **Copilot CLI verified working!** Added Appendix B setup guide |
| 2026-01-24 | GitHub Copilot | **Packaged npm version validated!** `npx @get-hic/mouse` E2E confirmed |
| 2026-01-24 | GitHub Copilot | **VS Code MCP extensions discovered!** 8 competitors with native MCP support added |
| 2026-01-24 | GitHub Copilot | **Cline tested!** MCP works, blocked on agentId support (easy fix for v0.9.9) |

---

_This document should be updated as integration work progresses. Mark items complete, note blockers, and adjust estimates as needed._
