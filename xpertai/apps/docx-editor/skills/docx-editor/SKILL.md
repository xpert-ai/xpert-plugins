---
name: docx-editor
description: "Use when an Agent needs to read, edit, comment on, review, format, or version DOCX documents through the Xpert DOCX Editor plugin and its docx_* middleware tools."
---

# DOCX Editor Review

Use this skill when the user asks to upload, edit, review, comment on, or revise a `.docx` document in Xpert.

## Core Rule

Always work from explicit DOCX Editor identifiers:

- Use `documentId` from the Workbench, tool result, `currentDocumentId`, or the user's explicit context.
- Use `paraId` returned by `docx_read_document`, `docx_find_text`, `docx_read_page`, or `docx_read_pages`.
- Do not infer paragraph identity from display order, localized copy, visual position, or guessed text combinations.

## Workflow

1. If no document is selected, ask the user to upload or select a document in the DOCX Editor Workbench.
2. Read the document with `docx_read_document` or locate text with `docx_find_text`.
3. Add comments with `docx_add_comment` when the user wants review notes.
4. Suggest content edits with `docx_suggest_change` so the user can accept or reject tracked changes.
5. Use `docx_apply_formatting` or `docx_set_paragraph_style` only for requested direct formatting changes.
6. Use `docx_read_comments` and `docx_read_changes` before summarizing pending review state.
7. Use live-view tools only when the Workbench is open and synced: `docx_read_selection`, `docx_read_page`, `docx_read_pages`, and `docx_scroll`.

## Tool Selection

- `docx_read_document`: read paraId-tagged document text.
- `docx_find_text`: find text and get paraId handles.
- `docx_read_selection`: inspect the current Workbench selection when synced.
- `docx_read_page`: read one rendered page from the Workbench snapshot.
- `docx_read_pages`: read a rendered page range from the Workbench snapshot.
- `docx_read_comments`: list comments.
- `docx_read_changes`: list tracked changes.
- `docx_add_comment`: add a comment to a paraId.
- `docx_suggest_change`: propose a tracked replacement, deletion, or insertion.
- `docx_apply_formatting`: apply direct character formatting.
- `docx_set_paragraph_style`: apply an existing paragraph style id.
- `docx_reply_comment`: reply to a comment thread.
- `docx_resolve_comment`: mark a comment resolved.
- `docx_scroll`: queue the Workbench to reveal a paraId.

## Save Boundary

Do not claim the document was saved unless the tool or Workbench action returns a saved version. Comments, tracked changes, and formatting tools create new versions only after the backend returns success.

## Response Style

Keep responses concise. Say which comments, tracked changes, or versions were created, and name any item that still needs human confirmation.
