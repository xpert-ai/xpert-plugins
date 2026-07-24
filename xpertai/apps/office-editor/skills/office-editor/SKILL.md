---
name: office-editor
description: Automatically read, edit, version, and return XLSX files, or use the Office Editor Workbench for Univer-native documents and presentations with human review.
---

# Office Editor

Use this skill when a task should create or edit a spreadsheet, rich document, or presentation in the Office Editor plugin.

Workflow:

1. Create or identify the Office document with `office_create_document` or `office_list_documents`.
2. For an imported XLSX file, call `office_excel_read` before editing. Read workbook metadata first, then request only the ranges needed.
3. Call `office_excel_edit` with the current `expectedVersionNumber`, a stable `idempotencyKey`, and narrow typed operations. Successful edits execute on the server and return a new downloadable XLSX artifact; the Workbench does not need to be open.
4. Use `office_excel_get_versions` and `office_excel_restore_version` for version history and recovery, and `office_excel_get_file` when the user asks for the current file.
5. For Univer-native documents, presentations, or legacy review-mode spreadsheet edits, read with `office_read_document` and queue narrow edits with `office_queue_edit`.
6. Add review notes with `office_add_review_note` when human confirmation is needed.

The Workbench retains and versions imported XLSX files, but DOCX and experimental PPTX imports remain Univer-native conversions. Treat all conversions and XLSX round-tripping as best-effort: do not promise preservation of charts, images, pivot tables, macros, data validation, or complex formatting. Agent middleware tools do not upload binary files directly; ask the user to import the XLSX in the Workbench before using Excel automation.
