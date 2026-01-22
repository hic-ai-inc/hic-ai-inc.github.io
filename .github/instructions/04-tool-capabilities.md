---
applyTo: "**"
description: "HIC MCP tools and capabilities quick reference"
---

# HIC MCP Tools & Capabilities

**4 tool groups, ~27 tools** - Use these constantly for best results

---

## 🚨 MANDATORY: Mouse Tools for File Editing

**STRICT REQUIREMENT:** All file editing MUST use Mouse `hic_local` tools.

**PROHIBITED** (violation of workspace policy):
- ❌ `replace_string_in_file` - NEVER USE
- ❌ `multi_replace_string_in_file` - NEVER USE

**REQUIRED** (use exclusively for editing existing files):
- ✅ `quick_edit` (mcp_hic_local_quick_edit)
- ✅ `batch_quick_edit` (mcp_hic_local_batch_quick_edit)
- ✅ `save_changes` / `cancel_changes`

This is a workspace requirement backed by empirical research: 56% higher first-try accuracy, 58% lower cost, 3.6× faster completion.

**Note:** `create_file` is appropriate for new files. Mouse is for editing existing files only.

**Why Mouse is superior:**
- ✅ Atomic multi-operation batching with rollback
- ✅ Columnar editing (FOR_LINES, ADJUST rect+move)
- ✅ Staged preview before commit (verify-first)
- ✅ Zero-calculation workflows with `find_in_file(showColumns: true)`

### Decision Tree

```
Single edit or small change?
  → quick_edit (instant save by default)

Multiple operations or multi-file edit?
  → batch_quick_edit → save_changes (REQUIRED!)
```

### Tool Selection Matrix

| Scenario                | Tool               | Workflow                           |
| ----------------------- | ------------------ | ---------------------------------- |
| Single edit (any size)  | `quick_edit`       | Instant save (unless safety trips) |
| 2+ edits to same file   | `batch_quick_edit` | Must call `save_changes` after     |
| Multi-file atomic edit  | `batch_quick_edit` | Must call `save_changes` per file  |
| Large edit (>500 lines) | `quick_edit`       | Auto-stages, need `save_changes`   |
| Many replacements (>10) | `quick_edit`       | Auto-stages, need `save_changes`   |

### Anti-Patterns to AVOID

❌ Never use `replace_string_in_file` or `multi_replace_string_in_file`  
❌ Never use multiple `quick_edit` calls in parallel on the same file (use `batch_quick_edit`)  
❌ Never forget `save_changes` after `batch_quick_edit`

### Key Features You MUST Leverage

✅ **find_in_file** - Search with regex; use `showColumns: true` to get copy-paste ready `rect` notation  
✅ **quick_edit** - One-shot edits with literal strings (instant save for small ops)  
✅ **batch_quick_edit** - Atomic multi-operation edits (requires save_changes)  
✅ **replace_range** - Character-level precision editing (preferred for surgical changes)  
✅ **ADJUST rect+move** - Zero-calculation columnar editing: copy rect from find_in_file, add move vector

⚠️ **REGEX DISABLED IN EDIT TOOLS**: Regex is ONLY available in search mode using `find_in_file`. Use it to locate patterns and get line numbers, then use `quick_edit` or `batch_quick_edit` with **line ranges** or **character-specific ranges** (preferred for precision) with **literal strings** only.

### 🔍 find_in_file - The Foundation for Confident Editing

**USE BEFORE complex edits** to validate patterns and locate targets.

**NEW (v0.9.7)**: Use `showColumns: true` to get copy-paste ready `rect` notation for columnar ADJUST:

```javascript
// Column Analysis with showColumns: true
find_in_file({
  filePath: "data.csv",
  pattern: "^TXN-[0-9]{4}-[A-Z]{3}",
  isRegex: true,
  showColumns: true,
});
// Output:
// 🔍 Column Analysis: "^TXN-[0-9]{4}-[A-Z]{3}"
// Matches: 125 | Lines: 2-126 | Cols: 0-12 ✓ consistent
// 📋 rect: [[2, 0], 12, 125]  ← Copy this directly into ADJUST!
```

```javascript
// Example 1: Simple line-based deletion
// Step 1: Find markers with literal search
find_in_file({
  filePath: "/workspace/src/api.js",
  pattern: "// ===== LEGACY",
  isRegex: false,
});
// Output: Line 45, Line 120 - now you KNOW what to delete

// Step 2: Delete entire line ranges
batch_quick_edit({
  filePath: "/workspace/src/api.js",
  operations: [
    { operation: "delete", startLine: 45, endLine: 60 },
    { operation: "delete", startLine: 120, endLine: 140 },
  ],
});
save_changes({ filePath: "/workspace/src/api.js" });

**Workflow Pattern**: Regex search → line-based or character-range edit

1. Use `find_in_file` with `isRegex: true` to locate patterns
2. Note line numbers and character positions from results
3. Use `batch_quick_edit` with `delete` operations on line ranges, OR
4. Use `quick_edit` with `replace_range` for character-level precision (preferred)

**Regex Safety**: Patterns validated to prevent catastrophic backtracking. Dangerous patterns like `(a+)+`, `(.*)+` are blocked.

---

## 🌟 Essential Tools (Use These Constantly)

### Notepad - Agent Coordination & Memory

**USE CONSTANTLY** for session memory and agent coordination:

- `make_note` - Remember findings for your future self
- `make_shared_note` - Coordinate with other agent (Q ↔ GC)
- `list_notes` / `list_shared_notes` - Review context
- `search_notes` - Find past decisions

**CRITICAL:** 25-line max per note. For longer content, create markdown file and reference it.

**Use for:** Session findings, agent coordination, decision tracking, handoff context  
**Never store:** API keys, tokens, passwords, secrets, PII

### Calculator - 100% Deterministic Math

**USE ALWAYS** for arithmetic (never mental math):

- `get_sum([10, 20, 30])` → 60
- `get_difference(100, 37)` → 63
- `get_product([3, 4, 5])` → 60
- `get_quotient(247.6821, 3.5739)` → 69.3...

**Why:** 15-digit precision, zero rounding errors, deterministic results

### DateTime - Timezone-Safe Operations

**USE ALWAYS** for dates/times (never assume timezone):

- `get_utc_date()` → "2025-10-29" (for code/logs)
- `get_utc_time()` → "2025-10-29 14:30:45" (for code/logs)
- `get_local_time("EST")` → "2025-10-29 10:30:45" (for humans)
- `get_unix_timestamp()` → 1729868445 (for calculations)

**Why:** DST-aware, timezone-safe, no ambiguity

### 🚀 quick_edit - One-Shot Editing

**FAST** - One call = read + edit + save. Instant by default, auto-stages for large operations.

```
quick_edit({ filePath, operation, ... })
```

**Six operations:**

| Operation       | Parameters                                                                   | Example                                |
| --------------- | ---------------------------------------------------------------------------- | -------------------------------------- |
| `insert`        | `afterLine`, `content`                                                       | Add lines at position                  |
| `replace`       | `find`, `replace`, `replaceAll`                                              | Literal find/replace                   |
| `delete`        | `region: [startLine, endLine]`                                               | Remove line range                      |
| `replace_range` | `region: [[startLine, startChar], [endLine, endChar]]`                       | Character-level edit                   |
| `for_lines`     | `lineRange`, `colRange`, `content`                                           | Columnar/rectangular edits             |
| `adjust`        | `rect`, `move` (v0.9.7) OR `from`, `to` OR `lineRange`, `fromCols`, `toCols` | Relocate content (vertical/horizontal) |

**Key features:**

- ✅ **Instant save** - Default behavior for small operations
- ✅ **Safety guardrails** - Auto-stages for >500 lines or >10 replacements
- ✅ **Literal matching** - Use exact strings only (no regex)
- ✅ **autoSave control** - Set `autoSave: false` to force staging
- ✅ **Refinement mode** - Multiple editing passes on staged content before saving

**Examples:**

```javascript
// INSERT - Add lines after line 10
quick_edit({
  filePath: "/workspace/src/index.js",
  operation: "insert",
  afterLine: 10,
  content: "// New comment\nconst x = 1;",
});

// REPLACE - Literal find/replace (no regex)
quick_edit({
  filePath: "/workspace/src/index.js",
  operation: "replace",
  find: "oldFunctionName", // Literal string only
  replace: "newFunctionName",
  replaceAll: true,
});

// DELETE - Remove lines 5-10
quick_edit({
  filePath: "/workspace/src/index.js",
  operation: "delete",
  startLine: 5,
  endLine: 10,
});

// REPLACE_RANGE - Character-level precision (preferred for surgical edits)
quick_edit({
  filePath: "/workspace/src/index.js",
  operation: "replace_range",
  startLine: 15,
  startChar: 10,
  endLine: 15,
  endChar: 25,
  content: "newValue", // Exact replacement
});

// FOR_LINES - Columnar editing (bulk line transforms)
// Comment out lines 10-50
quick_edit({
  filePath: "/workspace/src/index.js",
  operation: "for_lines",
  startLine: 10,
  endLine: 50,
  startCol: 0,
  endCol: 0,
  content: "// ", // Insert at column 0
});

**Safety note:** If quick_edit triggers safety guardrails (large operation), you'll need to call `save_changes` to commit.

### 🚀 batch_quick_edit - Atomic Multi-Operation Editing

**Mandatory Dialog Box** - One tool call for many operations, requires save_changes to commit.

```javascript
batch_quick_edit({
  filePath: "/workspace/src/index.js",
  operations: [
    {
      operation: "replace",
      find: "oldName1",
      replace: "newName1",
      description: "Rename class",
    },
    {
      operation: "replace",
      find: "oldName2",
      replace: "newName2",
      description: "Rename method",
    },
    {
      operation: "replace_range",
      startLine: 10,
      startChar: 0,
      endLine: 12,
      endChar: 50,
      content: "// Block",
    },
  ],
});
// REQUIRED: Call save_changes to commit
save_changes({ filePath: "/workspace/src/index.js" });
```

**Key features:**

- ✅ **Partial success** - Successful ops staged even when some fail; `operationsNeedingAttention` array reports failures
- ✅ **Multi-file support** - Each operation can specify its own filePath
- ✅ **Sequential** - Operations applied in order
- ✅ **Audit trail** - Optional `description` per operation
- ✅ **Mandatory staging** - Always requires save_changes after
- ✅ **Smart merge** - DELETE line N + INSERT after line N automatically merge to prevent overlap conflicts
- ✅ **Refinement mode** - Make multiple editing passes on staged content before saving (up to 10 passes)

**Workflow:**

1. **Invoke:** Call `batch_quick_edit` with all operations
2. **Review (optional):** Use `read_lines` with `staged=true` to inspect staged content
3. **Refine (optional):** Make additional `quick_edit` or `batch_quick_edit` calls to fix issues
4. **Commit:** Call `save_changes({ filePath })` to apply all operations atomically
5. **Or cancel:** Call `cancel_changes({ filePath })` to discard all staged changes

**Note:** Unlike quick_edit which auto-saves by default, batch_quick_edit ALWAYS stages and requires explicit save_changes.

### Refinement Mode & Adjust Operation

**REFINEMENT MODE**: When content is staged, you can make multiple editing passes before saving. Use this to:

- Fix typos in staged content
- Add missing imports or comments
- Adjust line positions if they're off-by-N

**ADJUST OPERATION**: Relocates staged content without re-typing. Two modes available:

**Mode 1: Single-Region (Vertical)** - Fix off-by-N errors:

```javascript
// Content landed at wrong position? ADJUST relocates without regenerating:
quick_edit({
  filePath: "/workspace/src/api.js",
  operation: "adjust",
  from: [56, 60], // Where it IS
  to: [72, 76],   // Where it SHOULD BE
});
save_changes({ filePath: "/workspace/src/api.js" });
```

**Mode 2: Columnar (Horizontal)** - Move columns across multiple lines:

```javascript
// Zero-calculation workflow with rect+move (v0.9.7)
// Step 1: Use find_in_file with showColumns to get rect
find_in_file({
  filePath: "data.csv",
  pattern: "^TXN-[0-9]{4}-[A-Z]{3}",
  isRegex: true,
  showColumns: true, // Returns copy-paste ready rect
});
// Output: rect: [[2, 0], 12, 125]  ← [[row, col], width, height]

// Step 2: Copy-paste rect, add move vector
quick_edit({
  filePath: "data.csv",
  operation: "adjust",
  rect: [[2, 0], 12, 125], // Copied directly from find_in_file
  move: [0, 126], // [deltaRows, deltaCols] - shift 126 cols right
});
```

**Columnar ADJUST modes**:

- **rect+move (v0.9.7)**: `rect: [[row, col], width, height]` + `move: [deltaRows, deltaCols]` - Zero calculation!
- **fromCols/toCols (v0.9.6)**: Manual column calculation, auto-normalizes for right-shifts

**Why this matters**: Complex batch edits take significant preparation time. If line numbers are off, `adjust` salvages the work instead of requiring complete re-creation. Columnar ADJUST enables efficient CSV/tabular transformations without rewriting entire files.

### Staged Content Inspection

Use `read_lines` with `staged=true` to inspect staged content before saving:

```javascript
// Read original file (default) - standard syntax
read_lines({ filePath: "file.js", startLine: 1, endLine: 50 });

// Read original file - compact region syntax
read_lines({ filePath: "file.js", region: [1, 50] });

// Read STAGED content (pending changes)
read_lines({ filePath: "file.js", region: [1, 50], staged: true });
```

**Key behaviors:**

- `staged: false` (default) → Always shows original file on disk
- `staged: true` → Shows what will be written when you call save_changes
- If no staging exists and `staged: true` → Returns error with helpful hint

### Side-by-Side Diff Capability

Call `read_lines` with `staged: false` AND `staged: true` in parallel for instant diff comparison.

### Choosing Between quick_edit and batch_quick_edit

| Scenario                             | Best Choice           | Why                                                 |
| ------------------------------------ | --------------------- | --------------------------------------------------- |
| Single edit                          | `quick_edit`          | Instant save, no extra calls                        |
| 2-3 independent edits                | Multiple `quick_edit` | Still fast, simple                                  |
| 4+ related edits                     | `batch_quick_edit`    | Atomic, token-efficient                             |
| Edits that must all succeed together | `batch_quick_edit`    | Partial success: good ops staged, failures reported |
| Large operation (>500 lines)         | Either (auto-staged)  | Safety guardrails trigger, needs save_changes       |

**Bottom line:** `quick_edit` for small edits (instant), `batch_quick_edit` for bulk changes (requires save_changes).

## Quick Reference Table

| Need                        | Tool                   | Example                                    |
| --------------------------- | ---------------------- | ------------------------------------------ |
| Remember something          | `make_note`            | Store findings for later                   |
| Coordinate with other agent | `make_shared_note`     | Q ↔ GC handoff                             |
| Add numbers                 | `get_sum`              | `get_sum([10, 20, 30])` → 60               |
| Today's date                | `get_utc_date`         | Returns "2025-10-29"                       |
| **Quick file edit**         | **`quick_edit`**       | **Insert, replace, or delete in one call** |
| **Multiple edits, atomic**  | **`batch_quick_edit`** | **Good ops staged, failures reported**     |
| Read file section           | `read_lines`           | Lines 10-50 from file                      |
| Search in file              | `find_in_file`         | Build & validate patterns, then edit       |
| Regex search                | `find_in_file`         | Locate patterns, then edit by line         |

---

## Error Handling

If `success: false`, **stop immediately**. Log error with full context and communicate to user. Don't retry or work around - this helps identify tool issues quickly.

## Authorization & Security

All agents have access to all 4 tool groups. Authorization enforced by MCP server architecture. All usage logged and auditable. See `05-security-requirements.md` for details.

---

## Questions?

- **Can I use tool X for Y?** → Check "Essential Tools" section
- **Authorization boundary?** → See `05-security-requirements.md`
- **How to use well?** → See `02-coding-standards.md`
- **Implementation details?** → See `03-architecture-patterns.md`

**Remember:** These are YOUR tools. If they don't work well, figure out why and say something. Propose fixes. Good Agent UX is YOUR responsibility too!
