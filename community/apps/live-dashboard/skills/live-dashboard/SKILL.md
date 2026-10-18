---
name: live-dashboard
description: Create and continuously edit saved live dashboards, including free-layout HTML/JavaScript pages and standard charts, using real data, declarative Bindings and Artifact drafts. Use for dashboard creation, styling, filters and refresh; not for ordinary static HTML delivery.
---

# Live dashboards

Use the platform SandboxFile tools to author source files. Use the dashboard tools to validate and save the business document. This skill belongs to the Live Dashboard plugin; data-source-specific query formats remain owned by each provider.

## Prerequisites

The Assistant needs LiveDashboard, SandboxFile and skillsMiddleware; Sandbox must be enabled. For Python/JavaScript data preparation it also needs WorkspaceScriptDataset and its `workspace-script-dataset` skill. If a required tool is absent, report that exact missing capability; do not invent an equivalent tool name.

Use the installed SKILL.md path shown in the skill catalog with `read_skill_file({"path":"<catalog path>"})`; resolve references relative to that file, not the sandbox working directory.

Read [data-validation.md](references/data-validation.md) when creating a dashboard or changing its data/Binding. Read [html-runtime.md](references/html-runtime.md) and its lifecycle example when authoring or changing HTML/JavaScript. Style-only edits preserve the saved Bindings and do not need to reconstruct upstream queries.

## One file editing interface

- Create a new file with `sandbox_write_file({"file_path":"dashboards/sales.html","content":"<!doctype html>..."})`.
- Read an existing file with `sandbox_read_file({"file_path":"..."})`.
- Change existing text with `sandbox_edit_file({"file_path":"...","old_string":"exact old text","new_string":"replacement"})`; use `sandbox_multi_edit_file` for multiple changes.
- `sandbox_write_file` does not overwrite existing files. Repair the current candidate with edits. If replacing an unsaved creation candidate with a new named file, include the earlier exact path in `supersedesPaths` on `dashboard_create_html` (or `dashboard_create` when choosing standard charts instead); only a successful save abandons that candidate, and files remain in Workspace. Do not abandon editing copies from `dashboard_open`. For a long new document, append subsequent complete segments with `sandbox_append_file` before saving the dashboard.
- Paths are relative to the current sandbox working directory. Use a real filename (`dashboards/sales.html`), never `.html`, whitespace-only names, absolute paths or guessed host paths. Copy returned paths exactly.
- The file content key is `content`, not `html`. The removed `dashboard_write_html` and `workspace_dataset_write_file` tools must not be used.

## Create a new dashboard

1. Call `dashboard_list_sources` before searching raw files, reading old scripts or creating transformations. For a named governed source, inspect that source/provider contract first; file-backed sources do not automatically require a script. Discover the authorized source and business schema. Validate the metric, period, grain, units and filters through real preview results; follow the data-validation reference.
2. For HTML mode, read the HTML runtime reference and call `dashboard_libraries` before using ECharts or Three.js. Write a complete HTML page using SandboxFile. First declare `const live = window.xpertLiveArtifact` inside the page script; `live` is not a host global. Then register `live.subscribe(bindingId, renderDataset)`, await `live.ready()`, then call `live.query(bindingId, typedControls)`. There is no `window.subscribe` or `window.__datasets`. Shared filters must query every affected Binding, not just call `bindSelect` for the first one.
3. Call `dashboard_create_html` with `title`, the relative `path`, verified `previewIds`, matching `controls` and the complete required `libraries` list. Standard charts instead use `dashboard_create`.
4. Correct validation errors and retry the domain save. A file write, screenshot or `present_files` receipt does not save a live dashboard. Do not present the HTML as a static deliverable.
5. Check the returned `dashboard.artifactId`, `dashboard.status: "draft"` and `dashboard.draftRevision`. The successful domain receipt opens/refreshes the Workbench preview.

## Continue editing the same dashboard

1. Call `dashboard_open({})` for the selected Workbench dashboard, or provide an exact Artifact ID from `dashboard_list`. Do not choose the most recent dashboard by guesswork or create a replacement Artifact.
2. Inspect `presentation.type`. For a standard dashboard, update definition fields directly; a rename needs only `title`, `editId`, `expectedRevision` and `expectedCurrentVersionId`. No HTML file exists: omit `htmlPath` and `libraries`. For a current HTML dashboard, the result includes a new `htmlPath` editing copy of the latest saved draft, plus `editId`, `expectedRevision` and `expectedCurrentVersionId`. Read this copy with SandboxFile before editing. Each open prepares a separate copy, preserving any uncommitted earlier files.
3. For HTML pages, apply requested changes with SandboxFile edits. Preserve data semantics, controls, query/subscription lifecycle and library locks unless the request changes them.
4. Automatically call `dashboard_update({"editId":"<returned ID>","expectedRevision":<returned revision>,"expectedCurrentVersionId":<returned UUID or null>,"title":"<new title if requested>"})` with the changed definition fields. When saving edited HTML, also supply the exact `htmlPath` of the editing file. Omit unchanged fields. Updating the visible heading does not rename the saved dashboard; pass `title` as well when renaming.
5. Check the saved draft receipt; for HTML file updates also check its `sourceFile` path/hash. For another batch, reopen the latest draft and use its new revisions. If the save fails, correct the definition or editing file and retry; do not claim success. If a revision conflict occurs, keep the edited file, open/read the latest state and reconcile before saving.
6. Historical `versionId` reads do not prepare an editable copy. Use `dashboard_read_html` to inspect historical source, then open the current draft to apply an intentional change.

## Save, preview and human publication

Agent saves are automatic working-draft saves; do not ask the user to confirm each edit. They preserve Artifact identity and published history. Only human confirmation in Workbench publishes a formal version. Never invent a v-number or equate file creation with a saved dashboard.

A successful save performs HTML/data validation and preserves the declaration-only Binding query boundary. On a failed save, the editing file remains available for correction while the last valid dashboard stays unchanged. Report the actual blocker when you cannot obtain a saved receipt.

## Show a dashboard in chat

Successful `dashboard_create`, `dashboard_create_html`, `dashboard_update` and `dashboard_open` calls emit a platform resource card automatically. Use `dashboard_list` to find an existing dashboard, then `dashboard_open` with its exact Artifact ID to present it. Do not invent Markdown links, emit raw HTML, or call `present_files` to represent the dashboard.

The card is a compact receipt with an Open button. It opens the registered Workbench view and exact Artifact. Draft cards open the latest saved content; an explicitly requested historical `versionId` stays pinned. The message snapshot is not proof of a later save or publication. Refer to the tool receipt when describing the result; do not claim a card was delivered if the host reports a presentation failure.

## Verify the result

Confirm the requested layout/title, change a real filter, refresh the data and verify that charts and totals update through `subscribe`. Reopen the saved draft and confirm the same Artifact and revision. Report data limitations and partial results explicitly. A syntactically valid page alone does not prove correct business metrics.
