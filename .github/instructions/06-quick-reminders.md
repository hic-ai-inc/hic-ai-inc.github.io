---
applyTo: "**"
description: "Critical reminders - read last, remember first"
---

# Quick Reminders

## 🚫 NEVER Use Built-In File Editing Tools

**PROHIBITED** (do not use under any circumstances):

- `replace_string_in_file`
- `multi_replace_string_in_file`

**REQUIRED** for all file editing:

- `quick_edit` - Single edits, instant save
- `batch_quick_edit` → `save_changes` - Multiple edits, atomic

**Why:** Research shows Mouse tools are 56% more accurate, 58% cheaper, and 3.6× faster than built-in tools (see mouse/docs/papers/2026_01/).

**Note:** `create_file` is fine for new files. Mouse is for **editing existing files only**.

## ⚠️ Common Mistakes

1. Forgetting `save_changes` after `batch_quick_edit`
2. Using built-in tools "just this once" - NEVER acceptable
3. Not using `find_in_file` to validate patterns before editing
