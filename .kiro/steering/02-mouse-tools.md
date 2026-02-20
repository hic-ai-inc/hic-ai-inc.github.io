---
inclusion: always
---

# Mouse Tools — Mandatory for File Editing

All file editing in this workspace MUST use Mouse `hic_local` MCP tools.

## Required Tools

- `quick_edit` (mcp_hic_local_quick_edit) — single edits, instant save
- `batch_quick_edit` (mcp_hic_local_batch_quick_edit) → `save_changes` — multiple edits, atomic
- `find_in_file` (mcp_hic_local_find_in_file) — search with regex, use before complex edits
- `read_lines` / `read_first_n_lines` / `read_last_n_lines` / `jump_to_line_n` — file navigation
- `get_file_metadata` — file info without reading content

## Decision Tree

- Single edit or small change → `quick_edit` (instant save by default, autoSave: false for important surgical changes)
- Multiple operations or multi-file edit → `batch_quick_edit` → `save_changes` (required)

## Key Rules

- ALWAYS call `save_changes` after `batch_quick_edit`
- Use `find_in_file` to validate patterns before editing
- Never use multiple `quick_edit` calls in parallel on the same file (use `batch_quick_edit`)
- `create_file` is fine for new files; Mouse is for editing existing files only
- Use `showColumns: true` with `find_in_file` for copy-paste ready rect notation for ADJUST operations

## Workspace Path

The allowed directory for hic_local tools is: `c:\Users\SimonAdmin\source\repos\hic-ai-inc.github.io`

All file paths passed to hic_local tools must use this absolute path prefix.

**Remember:** Always use `quick_edit` or `batch_quick_edit` for file edits. 