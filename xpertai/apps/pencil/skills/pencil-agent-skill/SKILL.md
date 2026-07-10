---
name: pencil-agent-skill
description: Use the Pencil Workbench to create and edit vector graphics, including illustrations, diagrams, and UI components, with human review.
---

Use this skill when you are working with the Pencil Agentic App, the Pencil Workbench, or tools named `pencil_*`.

## System Of Record

- Pencil middleware tools are the persistence path. Do not claim a design is saved, imported, exported, reviewed, archived, or versioned until the matching tool succeeds.
- Prefer the current Workbench document from `env.pencilDocumentId` or `pencilContextJson`.
- Mutating Pencil core tools update the working copy. They do not create a version. Use `pencil_save_version` for durable review checkpoints.
- Use `pencil_create_sample_document` when the user wants a realistic starting case or asks to verify the app with real dashboard data.

## Workbench Context

Workbench state variables may include:

- `pencilDocumentId`: selected document.
- `pencilVersionId`: selected version.
- `pencilNodeId`: selected node.
- `pencilSelectionJson`: compact selection context.
- `pencilContextJson`: compact document, version, and graph context.
- `pencilDirty`: local dirty state.

When context is present, parse it before choosing tools. Only create a new document when no current document exists or the user explicitly asks for a new one.

## File Import And Export

- Import `.fig` and `.pen` with `pencil_import_file`.
- Pass `/workspace/...`, workspace-relative paths, or portable file references directly.
- Export with `pencil_export_file`. Return the workspace path/reference, MIME type, size, and sha256.
- Do not return large base64 payloads to the user.

## Node Editing

- Call `pencil_get_document` before modifying existing user-edited documents.
- Call `pencil_get_node` before targeted edits to a selected node.
- Use selected `pencil_*` core tools for layout, style, structure, variables, analysis, and node reads/writes.
- For complex pages, render a small empty root frame first, then add one major region per `pencil_render` call with `parent_id` and `insert_index`. Keep the returned node ids for targeted follow-up work.
- Use `replace_id` to replace one placeholder or incorrect region. Do not regenerate an already successful page merely because another region failed.
- When using `pencil_render`, write OpenPencil JSX with `flex="col"` or `flex="row"` for auto-layout direction. Use `gap`, `p`/`px`/`py`/`pt`/`pr`/`pb`/`pl`, `w`/`h`, `bg`, `rounded`, `stroke`, and `strokeWidth` props. Do not use `flow` for auto-layout direction; `flow` is reserved for reading direction.
- If `pencil_render` returns `success=false`, `recoverable=true`, and a `renderDraftId`, call `pencil_render_patch`. Pass the returned revision and replace only the smallest uniquely matching `oldText` fragment. Never resend the complete JSX while an active draft is available.
- A failed render draft does not modify the document. A successful patch commits exactly one new working-copy revision.
- For complex auto-layout changes, prefer `pencil_set_layout` and `pencil_set_layout_child`, then read the document summary before saving a version.
- Always pass `documentId`.
- Keep `changeSummary` short and operational.

## Failure Recovery

If an import, export, graph edit, or save fails:

1. For a recoverable render diagnostic, repair its retained source with `pencil_render_patch` before reporting a terminal failure.
2. Record unrecoverable failures with `pencil_report_failure`.
3. Tell the user what failed and whether it is recoverable.
4. Suggest a concrete next step, such as reloading the document, saving the current working copy, or retrying with a smaller target selection.
