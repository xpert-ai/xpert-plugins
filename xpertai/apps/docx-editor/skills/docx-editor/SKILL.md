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
4. Follow the current Workbench mode when it is available: in suggesting mode prefer `docx_suggest_change`; in editing mode direct modification tools are acceptable when they exist; in viewing mode treat the document as read-only unless the user explicitly asks to modify it.
5. Use `docx_apply_formatting` or `docx_set_paragraph_style` only after confirming the target `paraId`.
6. Use `docx_read_comments` and `docx_read_changes` before summarizing pending review state.
7. Accept or reject tracked changes with `docx_accept_change`, `docx_reject_change`, `docx_accept_all_changes`, or `docx_reject_all_changes` after reading current change ids.
8. Resolve or delete comments with `docx_resolve_comment`, `docx_resolve_all_comments`, `docx_delete_comment`, or `docx_delete_all_comments` after reading current comment ids.
9. Use live-view tools only when the Workbench is open and synced: `docx_read_selection`, `docx_read_page`, `docx_read_pages`, and `docx_scroll`.

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
- `docx_resolve_all_comments`: mark all comments resolved.
- `docx_delete_comment`: delete one comment.
- `docx_delete_all_comments`: delete all comments.
- `docx_accept_change`: accept one tracked change.
- `docx_reject_change`: reject one tracked change.
- `docx_accept_all_changes`: accept all tracked changes.
- `docx_reject_all_changes`: reject all tracked changes.
- `docx_scroll`: queue the Workbench to reveal a paraId.

## Save Boundary

Do not claim the document was saved unless the tool or Workbench action returns a saved version. Comments, tracked changes, and formatting tools create new versions only after the backend returns success.

## Response Style

Keep responses concise. Say which comments, tracked changes, or versions were created, and name any item that still needs human confirmation.
