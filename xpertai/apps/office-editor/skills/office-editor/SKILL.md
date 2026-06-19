---
name: office-editor
description: Use the Office Editor Workbench to create and revise Univer-native spreadsheets, documents, and presentations with human review.
---

# Office Editor

Use this skill when a task should create or edit a spreadsheet, rich document, or presentation in the Office Editor plugin.

Workflow:

1. Create or identify the Office document with `office_create_document` or `office_list_documents`.
2. Read current content with `office_read_document` before proposing edits.
3. Queue narrow edits with `office_queue_edit`; use explicit `operationType` values rather than guessing document type from title or text.
4. Add review notes with `office_add_review_note` when human confirmation is needed.
5. Ask the user to open the Office Editor Workbench when queued edits need to be applied by the live Univer editor.

The Workbench can import XLSX, DOCX, and experimental PPTX files into new Univer-native documents. Treat imports as best-effort conversion: do not promise high-fidelity Office compatibility, original binary retention, or XLSX/DOCX/PPTX export. Agent middleware tools do not upload binary files directly; ask the user to import files in the Workbench before queueing edits.
