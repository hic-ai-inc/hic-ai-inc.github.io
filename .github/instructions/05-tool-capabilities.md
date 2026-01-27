---
applyTo: "**"
description: "HIC MCP tools quick reference"
---

<!-- ⛔ MANDATORY: Use Mouse tools (quick_edit, batch_quick_edit) for ALL file editing. See 00-mandatory-tool-rules.md -->

# HIC MCP Tools

**4 tool groups, ~27 tools**

## Mouse - File Editing

| Task           | Tool               | Notes                    |
| -------------- | ------------------ | ------------------------ |
| Single edit    | `quick_edit`       | Instant save             |
| Multiple edits | `batch_quick_edit` | Must call `save_changes` |
| Search first   | `find_in_file`     | Use before complex edits |
| New file       | `create_file`      | Then Mouse for edits     |

**Operations:** insert, replace, delete, replace_range, for_lines, adjust

## Notepad - Memory & Coordination

- `make_note` / `make_shared_note` - Remember / coordinate with other agent
- `list_notes` / `search_notes` - Review context
- 25-line max per note

## Calculator - Deterministic Math

- `get_sum([10, 20, 30])` → 60
- `get_difference(100, 37)` → 63
- `get_product([3, 4, 5])` → 60
- `get_quotient(a, b)` → precise division

**Always use for arithmetic. Never mental math.**

## DateTime - Timezone-Safe

- `get_utc_date()` / `get_utc_time()` - For code/logs
- `get_local_time("EST")` - For humans
- `get_unix_timestamp()` - For calculations
