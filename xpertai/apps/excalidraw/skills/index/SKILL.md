---
name: index
description: "Use when an Agent needs to create, update, review, or manage Excalidraw drawings through the Xpert Excalidraw plugin, including Mermaid drafts, Excalidraw JSON scenes, Workbench review, versioning, import/export, and failure reporting."
---

# Excalidraw Agent Drawing

Use this skill when a user asks to create, edit, review, convert, import, export, or manage an Excalidraw diagram in Xpert.

## Plugin Purpose

The Excalidraw plugin gives an Agent a structured drawing loop:

- Save reviewable Excalidraw drawing records.
- Store every meaningful change as a version.
- Use Mermaid for quick flow and architecture drafts.
- Use Excalidraw JSON elements when layout, styling, or freeform drawing needs precision.
- Let the user inspect, edit, convert, restore, import, export, approve, or archive the drawing in the Excalidraw Workbench.

## Default Workflow

1. Identify the drawing goal, audience, key nodes, relationships, and required precision.
2. For flows, state transitions, architecture flows, or simple dependency maps, prefer Mermaid and save it with `excalidraw_save_mermaid_draft`.
3. For precise styling, free layout, annotations, or updates to a user-edited canvas, prefer staged Excalidraw JSON: create the drawing without elements, then call `excalidraw_add_elements` with one element or a small logical batch at a time.
4. Before updating an existing drawing, call `excalidraw_get_drawing` for compact metadata. If element ids or geometry summaries are needed, call it with `includeScene=true` and a `versionNumber` or `versionId`; use `elementOffset`/`elementLimit` for large drawings. Fetch exact scene data with `excalidraw_get_scene_item` using an explicit `itemType`.
5. Use concise titles and `changeSummary` values so the Workbench version history stays readable.
6. If the request cannot be converted safely, call `excalidraw_report_failure` and explain the smallest useful next step.

## Tool Selection

- `excalidraw_create_drawing`: create a new managed drawing metadata record. It does not accept elements, appState, files, or Mermaid source. Use the returned `drawingId` for the next tool call.
- `excalidraw_add_elements`: append one element or a small logical batch, max 20, to an existing drawing. Prefer 1-5 related elements per call for complex diagrams so a bad element only rejects one batch.
- `excalidraw_save_scene_version`: save a complete Excalidraw scene as a new version. Use only when replacing the whole scene is intentional, and read the current drawing first if the user may have edited it.
- `excalidraw_patch_scene`: save a targeted add/update/delete patch against the current version. Unknown ids, duplicate ids, element type changes, invalid elements, and no-op patches are rejected.
- `excalidraw_save_mermaid_draft`: save Mermaid source for automatic Workbench conversion, version save, and user review. Best for flowcharts, architecture flows, state diagrams, and quick drafts.
- `excalidraw_search_drawings`: find existing drawings.
- `excalidraw_get_drawing`: read compact drawing metadata, current version ref, lightweight version refs, optional recent log metadata, and optional paged lightweight element refs. It intentionally avoids full scene JSON.
- `excalidraw_get_scene_item`: fetch one full scene item from a drawing version by explicit type: `element`, `appState`, `file`, or `mermaidSource`.
- `excalidraw_update_drawing_status`: mark draft, reviewed, or archived after user confirmation.
- `excalidraw_report_failure`: record generation, conversion, or import/export failures.

## Tool Combination Recipes

### New Precise Excalidraw Diagram

1. Call `excalidraw_create_drawing` with title, kind, tags, and source.
2. Call `excalidraw_add_elements` repeatedly with small batches. Use stable ids and a useful `changeSummary` for each batch.
3. For large scenes, call `excalidraw_get_drawing` with `includeScene=true` and paged `elementOffset`/`elementLimit` to verify lightweight refs instead of reading every full element.
4. Use `excalidraw_patch_scene` for final targeted corrections, or `excalidraw_save_scene_version` only for a deliberate full replacement.

### Mermaid-First Draft

1. Use `excalidraw_save_mermaid_draft` with `drawingId` when updating an existing drawing, or with `title` when creating a new one.
2. Let the Workbench auto-convert the Mermaid draft and save an editable Excalidraw version after tool completion.
3. Call `excalidraw_get_drawing` to inspect compact version metadata; use `excalidraw_get_scene_item` only if the exact Mermaid source, appState, file payload, or full element JSON is needed.
4. Refine the converted result with `excalidraw_patch_scene` or `excalidraw_add_elements`.

### Existing Drawing Update

1. Use `excalidraw_search_drawings` if the drawing id is unknown.
2. Call `excalidraw_get_drawing` before editing. Default output is compact; use `versionId` or `versionNumber` when targeting an older version.
3. If element ids or geometry are needed, call `excalidraw_get_drawing` with `includeScene=true`. It returns paged lightweight element refs, not full JSON.
4. Fetch exact data only for the items you need:
   - `itemType=element` with `elementId` for full element JSON.
   - `itemType=appState` for full appState.
   - `itemType=file` with `fileId` for a file payload.
   - `itemType=mermaidSource` for full Mermaid source.
5. Use `excalidraw_patch_scene` for targeted edits, `excalidraw_add_elements` for append-only additions, and `excalidraw_save_scene_version` for complete replacement.

### Large Scene Inspection

1. Call `excalidraw_get_drawing` without `includeScene` first to get compact refs and `nextActions`.
2. Page element refs with `includeScene=true`, `elementOffset`, and `elementLimit` only for the version you need.
3. Call `excalidraw_get_scene_item` for full payloads one item at a time. Do not request full appState, files, and many elements unless the task actually needs them.

### Review and Lifecycle

1. Use `excalidraw_update_drawing_status` only after the user or workflow has confirmed draft, reviewed, or archived status.
2. Physical deletion of drawings and versions is a Workbench UI action with a confirmation Dialog, not an Agent middleware tool. Do not promise deletion through middleware tools; archive through `excalidraw_update_drawing_status` when an Agent-side lifecycle action is needed.

## Excalidraw Element Rules

- Send full, serializable Excalidraw element objects. Required common fields include `id`, `type`, geometry, style, opacity, seed, version metadata, deletion/lock flags, grouping, and binding fields.
- Use stable unique ids. Never add duplicate ids. `excalidraw_patch_scene` cannot change an existing element's `type`.
- If you provide `updated`, it must be a finite number. Omitting it is accepted and normalized by the service.
- Use `index: null` or omit `index` unless you have a valid Excalidraw order key. Do not invent short invalid order keys such as `f9`.
- For text elements, include text-specific fields such as `fontSize`, `fontFamily`, `text`, `originalText`, `textAlign`, `verticalAlign`, `containerId`, `autoResize`, and `lineHeight`.
- For arrows and lines, include `points`, bindings, arrowheads, and `elbowed` for arrows.
- For image elements, include a matching file entry in `files` for the element `fileId`.
- Keep `appStatePatch` and `files` omitted unless the batch really changes them; avoid overwriting user state or existing files accidentally.

## Workbench Contract

Do not claim that a drawing is finalized just because Mermaid or JSON was drafted. The Workbench is the human review surface. Mermaid drafts are auto-converted and saved as editable versions, and a user can edit the Excalidraw canvas, save more versions, restore prior versions, mark a drawing as reviewed, archive drawings, and delete drawings or versions after Dialog confirmation.

## Response Style

Keep user responses concise. Say which path you used, what was saved, and what the user can review next in the Workbench.
