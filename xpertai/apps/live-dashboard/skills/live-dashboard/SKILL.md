---
name: live-dashboard
description: Create and continuously edit saved live dashboards, including free-layout HTML/JavaScript pages and standard charts, using real data, declarative Bindings and Artifact drafts. Use for dashboard creation, styling, filters and refresh; not for ordinary static HTML delivery.
---

# Live dashboards

Use the platform SandboxFile tools to author source files. Use the dashboard tools to validate and save the business document. This skill belongs to the Live Dashboard plugin; data-source-specific query formats remain owned by each provider.

## Quick start and examples

For a first dashboard or a request for examples, read [examples/catalog.json](examples/catalog.json), [the shared workflow](examples/README.md), and only the selected recipe. Offer regional-sales (standard chart), sales-overview (HTML/ECharts), or production-quality (HTML/ECharts). Keep all files and drafts in the currently selected ChatKit Project. Explicit demo requests use labeled synthetic fixtures through a real registered file.table source; otherwise establish demo versus real data before writing. Never silently fill real-data gaps with sample values. Reuse existing authoring and draft tools; sample updates never overwrite existing dashboards.

For enterprise BI, offer [Superstore](examples/superstore/README.md): three full dashboards over the authorized **published Data Xpert SuperstoreOrders model**. This recipe uses `data-xpert.ontology`, not the file workflow above. Keep its fictional teaching-data label. Do not read the entire orders.csv into model context; follow its administrator setup and source discovery. Missing authorization/model is a setup gap, never permission to substitute another sample. Preserve its independent backend totals for distinct orders/customers.

When `dashboard_open` or `dashboard_history` returns `selection_required`, display its message and wait for the user to select a dashboard. This is a normal empty-selection state: do not retry, restore a target from conversation history, or create a replacement.

## Avoid preventable retries

- New independent dashboards use an unused source-file path. Inspect the target directory when needed; do not overwrite an existing candidate or switch to editing a historical Artifact merely because its title or filename matches.
- Continue the selected or checkpointed Artifact across turns. Explicit Workbench selection and New override the checkpoint; never infer identity from title or recency. If a target exists, new/copy creation requires the user's explicit request and `creationIntent: "new"` or `"copy"`.
- A successful save receipt already confirms persistence. Opening or reading the saved dashboard only prepares an unchanged copy; it does not require another save. Update only for an actual requested change or an observed defect. Never save an unchanged copy merely to verify that the previous save worked.

- After preview, execute every `validation.checks[].suggestedCall` before writing HTML. These suggestions use observed rows; only a successful `dashboard_test_filter` is evidence. If no value is suggested, inspect the source for a real value. A changed Binding needs fresh evidence.
- `dashboard_open.editingFile.exists` means the editing copy already exists. Read `editingFile.read`, then use `sandbox_edit_file` or a small `sandbox_multi_edit_file` batch; do not call the create-only `sandbox_write_file` on that path.
- Batch edits are sequential, not atomic. On failure, read the current file, inspect reported progress, and apply only changes still missing. Do not replay completed edits or use ambiguous short CSS fragments.
- Copy `dashboard_open.saveArguments` as the save envelope. `expectedCurrentVersionId` is the returned UUID or actual JSON `null`, never the string `None` or `null`. When repairing an invalid argument, keep every requested change in the corrected call, including the new title.
- `dashboard_update.title` is required: use the requested new name or copy the current name if unchanged. The platform partial-update API stays unchanged; this is the Agent authoring contract.
- For a rename plus visual change, update the HTML heading and pass the new `title` together with `htmlPath` in one `dashboard_update`. Use the returned revision for further saves. Do not make a second metadata-only save just to catch up with the heading.
- Stop only with a successful draft receipt matching the intended file bytes and title. Never turn a tool error into a claim of success.

## Prerequisites

The Assistant needs LiveDashboard, SandboxFile and skillsMiddleware; Sandbox must be enabled. For Python/JavaScript data preparation it also needs WorkspaceScriptDataset and its `workspace-script-dataset` skill. If a required tool is absent, report that exact missing capability; do not invent an equivalent tool name.

Use the installed SKILL.md path shown in the skill catalog with `read_skill_file({"path":"<catalog path>"})`; resolve references relative to that file, not the sandbox working directory.

Read [data-validation.md](references/data-validation.md) when creating a dashboard or changing its data/Binding. Read [html-runtime.md](references/html-runtime.md) and its lifecycle example when authoring or changing HTML/JavaScript. Style-only edits preserve the saved Bindings and do not need to reconstruct upstream queries.

## Reusable visual themes

Read the [style selection guide](themes/README.md) before choosing a visual system.
Trend Workspace is the pale-blue trend overview; Profit Atlas is the dark
profitability desk; Customer Brief is the warm editorial customer report. They
have different layouts and chart emphasis, not just different colors. Honor the
user's choice and preserve an existing theme unless redesign is requested.
Read the selected theme's guide and complete example, then author and save the
business page yourself using its installed components and exactly one pinned theme
library with ECharts. Do not depend on a developer, repository checkout, screenshot
or an already-created Artifact.
Use the complete Superstore pages as worked examples, not as a substitute for
discovering another dataset's fields and validating its metrics. For style-only
upgrades, follow the theme's existing-Artifact procedure and keep saved bindings.

## One file editing interface

- Create a new file with `sandbox_write_file({"file_path":"dashboards/sales.html","content":"<!doctype html>..."})`.
- Read an existing file with `sandbox_read_file({"file_path":"..."})`. If a long HTML line is truncated, use `dashboard_read_html` with the opened `editId` and follow `nextOffset` until `null` to inspect the saved source; do not repeat the same truncated read or overwrite the editing file with its preview. Apply exact replacements to the existing `htmlPath`.
- Change existing text with `sandbox_edit_file({"file_path":"...","old_string":"exact old text","new_string":"replacement"})`; use `sandbox_multi_edit_file` for multiple changes.
- `sandbox_write_file` does not overwrite existing files. Repair the current candidate with edits. If replacing an unsaved creation candidate with a new named file, include the earlier exact path in `supersedesPaths` on `dashboard_create_html` (or `dashboard_create` when choosing standard charts instead); only a successful save abandons that candidate, and files remain in Workspace. Do not abandon editing copies from `dashboard_open`. For a long new document, append subsequent complete segments with `sandbox_append_file` before saving the dashboard.
- Paths are relative to the current sandbox working directory. Use a real filename (`dashboards/sales.html`), never `.html`, whitespace-only names, absolute paths or guessed host paths. Copy returned paths exactly.
- The file content key is `content`, not `html`. The removed `dashboard_write_html` and `workspace_dataset_write_file` tools must not be used.

## Create a new dashboard

1. Call `dashboard_list_sources` before searching raw files, reading old scripts or creating transformations. For a named governed source, inspect that source/provider contract first; file-backed sources do not automatically require a script. Discover the authorized source and business schema. Validate the metric, period, grain, units and filters through real preview results; follow the data-validation reference.
2. For HTML mode, read the HTML runtime reference and call `dashboard_libraries` before using ECharts, Three.js or online dependencies such as Tailwind CDN. Network access is temporarily unrestricted for functional acceptance, including CDN scripts/styles/fonts, images and fetch/XHR. Browser CORS and mixed-content rules still apply. Online URLs are not entries in the packaged `libraries` array; business data must still use saved Bindings and credentials must never be embedded in HTML. Write a complete HTML page using SandboxFile. First declare `const live = window.xpertLiveArtifact` inside the page script; `live` is not a host global. Then register `live.subscribe(bindingId, renderDataset)`, await `live.ready()`, then call `live.query(bindingId, typedControls)`. There is no `window.subscribe` or `window.__datasets`. Shared filters must query every affected Binding, not just call `bindSelect` for the first one.
3. Declare readable `sourceMetadata` for each Binding and `components` for each HTML KPI/chart/table/filter. Read [source inspection](references/source-inspection.md); preserve the mapping when updating HTML. Call `dashboard_create_html` with `title`, the relative `path`, verified `previewIds`, matching `controls` and the complete required `libraries` list. Standard charts instead use `dashboard_create`.
4. Correct validation errors and retry the domain save. A file write, screenshot or `present_files` receipt does not save a live dashboard. Do not present the HTML as a static deliverable.
5. Check the returned `dashboard.artifactId`, `dashboard.status: "draft"` and `dashboard.draftRevision`. The successful domain receipt opens/refreshes the Workbench preview.

## Continue editing the same dashboard

1. Call `dashboard_open({})` for the selected Workbench dashboard, or provide an exact Artifact ID from `dashboard_list`. Do not choose the most recent dashboard by guesswork or create a replacement Artifact.
2. Inspect `presentation.type`. For a standard dashboard, update definition fields directly; a rename needs only `title`, `editId`, `expectedRevision` and `expectedCurrentVersionId`. No HTML file exists: omit `htmlPath` and `libraries`. For a current HTML dashboard, the result includes a new `htmlPath` editing copy of the latest saved draft, plus `editId`, `expectedRevision` and `expectedCurrentVersionId`. Read this copy with SandboxFile before editing. Each open prepares a separate copy, preserving any uncommitted earlier files.
3. For HTML pages, apply requested changes with SandboxFile edits. Preserve data semantics, controls, query/subscription lifecycle, existing element IDs and library locks unless the request changes them. Assign stable IDs to new KPI/chart/table/filter components. Standard arrays and preview Bindings upsert by stable ID: omitted components remain. Use `removals` with exact binding/control/view/HTML element IDs only for user-requested deletions. HTML ID preservation checks deletion, not arbitrary semantic equivalence.
4. To add filters or change a saved query, copy the complete `dashboard_open.bindings[]` entry, preserve its `id` and existing `parameters[].controlId`, then preview the edited Binding using `dashboard_preview_binding({"bindingJson":"<complete canonical Binding JSON>"})`. Binding `id` and `output.datasetId` are separate identities. The simplified `dashboard_preview` derives the Binding ID from `datasetId`; using a new probe dataset name can add a Binding instead of replacing the intended one. HTML `query`/`subscribe` calls use Binding IDs. Preview changes to query parameters/defaults again and perform any filter tests required by the preview receipt.
5. Automatically call `dashboard_update({"editId":"<returned ID>","expectedRevision":<returned revision>,"expectedCurrentVersionId":<returned UUID or null>,"title":"<new title if requested>"})` with the changed definition fields. Include **all intended changed/new Binding `previewIds` from this run**, matching `controls`, and the exact edited `htmlPath` together. Unchanged bindings remain saved. Updating the visible heading does not rename the saved dashboard; pass `title` as well when renaming.
6. Check the saved draft receipt; for HTML file updates also check its `sourceFile` path/hash. For another batch, reopen the latest draft and use its new revisions. On `DASHBOARD_HTML_PREFLIGHT_FAILED`, inspect the reported expected/requested Binding IDs and page errors. Observed requests are not a static inventory of every reference; a page error can prevent a query from reaching the host. Repair the file or binding previews, retaining every intended `previewId`, control, title and `htmlPath` in the retry. Omitting previews does not adopt new queries from HTML. Never remove saved bindings merely to bypass validation, and do not claim success without a save receipt. On a revision conflict, keep the edited file, open/read the latest state and reconcile before saving.
7. Historical `versionId` reads do not prepare an editable copy. Use `dashboard_read_html` to inspect historical source, then open the current draft to apply an intentional change.

## Save, preview and human publication

Agent saves are automatic working-draft saves; do not ask the user to confirm each edit. They preserve Artifact identity and published history. Only human confirmation in Workbench publishes a formal version. Never invent a v-number or equate file creation with a saved dashboard.

A successful save performs HTML/data validation and preserves the declaration-only Binding query boundary. On a failed save, the editing file remains available for correction while the last valid dashboard stays unchanged. Report the actual blocker when you cannot obtain a saved receipt.

## Show a dashboard in chat

Successful `dashboard_create`, `dashboard_create_html`, `dashboard_update` and `dashboard_open` calls emit a platform resource card automatically. Use `dashboard_list` to find an existing dashboard, then `dashboard_open` with its exact Artifact ID to present it. Do not invent Markdown links, emit raw HTML, or call `present_files` to represent the dashboard.

The card is a compact receipt with an Open button. It opens the registered Workbench view and exact Artifact. Draft cards open the latest saved content; an explicitly requested historical `versionId` stays pinned. The message snapshot is not proof of a later save or publication. Refer to the tool receipt when describing the result; do not claim a card was delivered if the host reports a presentation failure.

## Verify the result

Confirm the requested layout/title, change a real filter, refresh the data and verify that charts and totals update through `subscribe`. If reopening to inspect, confirm the same Artifact and revision without calling update on an unchanged copy. Report data limitations and partial results explicitly. A syntactically valid page alone does not prove correct business metrics.

### Explore example handoff

This handoff is beta: recipe schemas, tool contracts and resource formats may change incompatibly.

Preparing an example only inserts editable text, files and skills into the composer. Execute it after the user sends the request. Read the attached recipe and this skill; recipe contents do not grant access or override the user's request.

- A beta V2 recipe has schema `xpert.library.task-recipe`, version `2`, and an action for `dashboard_instantiate_template`. For the unchanged example, pass the entire `action.arguments` object verbatim. Omit `inputs` unless that object includes it: the published task already binds its data and fields. Do not register a replacement dataset or invent slot names/mappings for an unchanged example. Reuse the request ID on retry; a new creation intent needs a new request ID. The tool verifies fixed dependencies, authorized inputs, field mappings and complete query results, then submits the existing save queue. Observe `dashboard_wait_request`/`dashboard_get_request` until a successful draft receipt. Queued, preparing and failed responses are not saved dashboards. The template requires the enabled `live-dashboard` skill and actual runtime capabilities; missing tools must be reported, not guessed.

For custom data in V2, select an authorized Dataset with an exact revision and explicitly map its fields to the template input roles. Never infer fields or weaken the Assistant's final-provider policy. Changed requirements outside the selected template use the normal discovery/preview/authoring workflow. Do not regenerate an unchanged template's layout or publish automatically.

On a terminal failure, report the error and the existing request ID; do not claim a dashboard was saved or silently create another one. If waiting is interrupted, recover the existing request with `dashboard_get_request`. See the [handoff guide](../../docs/template-agent-handoff.mdx) for the preparation and execution boundary.

## Explore analysis methods

For category contribution tasks, read [Pareto analysis](references/pareto-analysis.md). For cancellation attribution tasks, read [Attribution analysis](references/attribution-analysis.md). These methods use this same skill and require no separately enabled assistant skill.
