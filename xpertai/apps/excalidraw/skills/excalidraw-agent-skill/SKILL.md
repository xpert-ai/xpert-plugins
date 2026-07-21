---
name: excalidraw-agent-skill
description: "Use when an Agent needs to use @xpert-ai/plugin-excalidraw middleware tools to create, inspect, patch, version, review, or recover Excalidraw drawings, including Workbench selection context and Mermaid drafts."
---

# Excalidraw Agent Skill

Use this skill when a user asks an Agent to create, update, inspect, review, or recover an Excalidraw drawing through the Xpert Excalidraw plugin.

The plugin has two surfaces:

- Workbench: the human review and editing surface. It can list drawings, edit the canvas, save versions, import/export JSON/PNG/SVG, convert Mermaid, restore versions, mark reviewed/draft, archive, and delete drawings or versions.
- Middleware tools: the Agent-callable system of record. These tools create drawing records, save scene versions, patch elements, save Mermaid drafts, search/read compact metadata, fetch exact scene items, update lifecycle status, and report failures.

Do not treat Workbench view actions as Agent middleware tools. Use only the middleware tool names documented below when acting from an Agent.

## Core Rules

Before creating a new drawing, call `excalidraw_list_typography_presets`, choose a managed built-in preset, and use its returned `fontFamilyId`. Do not invent custom font ids or URLs.

1. Do not invent drawing ids, version ids, or element ids for existing drawings. Use Workbench context, `excalidraw_search_drawings`, `excalidraw_get_drawing`, or `excalidraw_get_scene_item`.
2. Prefer direct Excalidraw elements as the default creation path. Use Mermaid only when the user explicitly asks for Mermaid, provides Mermaid source, or wants a fast low-fidelity draft where exact layout and editability are less important.
3. If the rendered `excalidrawDrawingId` value or middleware-injected current Workbench context is present, update that current Workbench drawing. Do not call `excalidraw_create_drawing` for additions, blank-area insertions, title edits, restyling, or other updates to that drawing.
4. For new complex diagrams where no current drawing exists or the user explicitly asks for a new drawing, call `excalidraw_create_drawing` first, then call `excalidraw_add_elements` in one element or small logical batches. This gives the Workbench incremental updates and keeps failures easy to retry.
5. Before editing an existing drawing, call `excalidraw_get_drawing` first unless the current prompt already contains a trustworthy Workbench context with the drawing id and version ref.
6. Prefer `excalidraw_patch_scene` for targeted edits. Use `excalidraw_save_scene_version` only when a full scene replacement is intentional.
7. Use `excalidraw_get_drawing` for compact metadata and lightweight refs. Use `excalidraw_get_scene_item` for full element JSON, full appState, file payloads, or full Mermaid source.
8. Keep changes small and reviewable. Use short `changeSummary` values that describe the operation, not a long user-visible answer.
9. Do not claim a drawing was saved unless the tool call succeeded. Tool results are the source of truth.
10. Do not route logic from display text, localized labels, sample titles, or incidental field combinations. Use explicit fields such as `selection.type`, `itemType`, `kind`, `status`, and `sourceType`.

## Default Tool Choice

Choose the tool path in this order:

1. Current Workbench drawing update: use rendered `excalidrawDrawingId` or the middleware-injected current Workbench context -> `excalidraw_get_drawing` -> `excalidraw_add_elements`, `excalidraw_patch_scene`, or `excalidraw_save_scene_version`.
2. New editable diagram when no current drawing exists or the user explicitly asks for a new drawing: `excalidraw_create_drawing` -> repeated `excalidraw_add_elements`.
3. Existing drawing targeted edit by explicit id or search result: `excalidraw_get_drawing` -> optional `excalidraw_get_scene_item` -> `excalidraw_patch_scene`.
4. Intentional full replacement: `excalidraw_save_scene_version`.
5. Explicit Mermaid import/draft: `excalidraw_save_mermaid_draft`.
6. Failure or unresolved context: `excalidraw_report_failure`.

Do not choose Mermaid just because the diagram is a flowchart or architecture map. The plugin can create editable boxes, labels, arrows, groups, frames, and containers directly with Excalidraw elements, and that should be the default.

## Workbench Selection Context

The Workbench automatically sends `assistant.context.set` when the user opens a drawing or changes the canvas selection. The payload goes into runtime context/env for the Agent run. Middleware also reads that runtime context directly and can inject the current `drawingId` into Excalidraw tools when the tool call omits it.

The assistant prompt may render runtime env values as plain field-name lines. Reason from those visible names and values, not from JavaScript-style paths such as `env.excalidrawDrawingId`, and not from persistent state variable names.

When the prompt includes these rendered field names, use them before searching broadly:

- `excalidrawDrawingId`
- `excalidrawVersionId`
- `excalidrawVersionNumber`
- `excalidrawSelectedElementIdsJson`
- `excalidrawSelectionJson`
- `excalidrawContextJson`
- `excalidrawSceneDirty`

Template `stateVariables` are not required for these Workbench values. Older state names such as `currentDrawingId`/`currentVersionId` are not the source of truth.

If rendered `excalidrawDrawingId` is non-empty, treat it as the current Workbench drawing even when no elements are selected. If rendered `excalidrawContextJson` is non-empty, parse it as JSON for extra metadata. The expected shape is:

```json
{
  "currentDrawing": {
    "drawingId": "drawing-id",
    "title": "Drawing title",
    "currentVersionId": "version-id",
    "currentVersionNumber": 12,
    "isDirty": true,
    "source": "@xpert-ai/plugin-excalidraw",
    "selection": {
      "type": "excalidraw.selection.v1",
      "selectedElementIds": ["element-id"],
      "selectedElementCount": 1,
      "elements": [
        {
          "id": "element-id",
          "type": "rectangle",
          "x": 10,
          "y": 20,
          "width": 200,
          "height": 80,
          "textPreview": "optional text",
          "groupIds": ["group-id"],
          "containerId": "container-id",
          "boundElementIds": ["arrow-id"]
        }
      ],
      "bounds": { "x": 10, "y": 20, "width": 200, "height": 80 },
      "capturedAt": "2026-06-21T15:22:28.459Z"
    }
  }
}
```

Selection rules:

- `currentDrawing` may exist without `selection`; this means a drawing is open but no element is selected. Use the rendered `excalidrawDrawingId` or the middleware-injected current Workbench context for additions such as "add this in the blank area".
- Treat `currentDrawing.selection.type === "excalidraw.selection.v1"` as the only valid machine-readable selection discriminator.
- If a valid selection exists, modify only `selectedElementIds` unless the user explicitly asks to affect neighboring or unselected elements.
- Use compact `selection.elements` only for orientation, bounds, and intent. Fetch full element JSON with `excalidraw_get_scene_item` before changing exact geometry, style, bindings, text, or file-backed elements.
- If `currentDrawing.isDirty === true` or rendered `excalidrawSceneDirty` is `true`, the compact selected refs may include unsaved canvas state newer than the persisted current version. Use the refs to understand the user intent, then fetch persisted JSON before patching. If the selected id is missing in the persisted version, ask the user to save the Workbench version or explain that the unsaved element cannot be patched by middleware yet.
- If no valid selection context exists but the user asks to edit "the selected element", ask them to select an element or provide a drawing id and element id.

## Tool Contracts

### `excalidraw_create_drawing`

Create a managed drawing metadata record.

Inputs:

- Required: `title`.
- Optional: `description`, `kind`, `tags`, `source`, `changeSummary`.
- `kind` is one of `diagram`, `whiteboard`, `flowchart`, `architecture`, `wireframe`, `other`.

Rules:

- Do not call this when rendered `excalidrawDrawingId` or middleware-injected context identifies the current Workbench drawing and the user is asking to add, edit, or place content in that drawing.
- This middleware schema is metadata-only. Do not pass `elements`, `appState`, `files`, or `mermaidSource`.
- After success, call `excalidraw_add_elements`, `excalidraw_save_scene_version`, or `excalidraw_save_mermaid_draft` with the returned `drawingId`.

### `excalidraw_add_elements`

Append valid full Excalidraw elements to an existing drawing.

Inputs:

- Required: `elements`.
- Optional: `drawingId`, `appStatePatch`, `files`, `mermaidSource`, `changeSummary`.
- Omit `drawingId` only when operating on the current Workbench drawing identified by rendered `excalidrawDrawingId` or middleware-injected context.
- `elements` must contain 1 to 20 full element objects.

Rules:

- Prefer 1 to 5 logically related elements per call for complex diagrams.
- This tool routes through the same strict patch path as `excalidraw_patch_scene`.
- Added element ids must be unique and must not already exist in the current scene.
- Omit `files` unless adding or replacing file-backed assets. If provided, it replaces the current files map.

### `excalidraw_save_scene_version`

Save a complete valid Excalidraw scene as a new version.

Inputs:

- Required: `drawingId` unless operating on the current Workbench drawing.
- Optional: `elements`, `appState`, `files`, `mermaidSource`, `sourceType`, `changeSummary`.
- `sourceType` is one of `agent_json`, `agent_patch`, `agent_mermaid`, `workbench`, `workbench_mermaid`, `import`, `restore`; Agent full JSON should normally use `agent_json`.

Rules:

- Use this only for intentional full replacement or full-scene creation after a drawing record exists.
- Read the current drawing first if user edits may exist.
- Preserve `appState`, `files`, and `mermaidSource` from the current version when they should remain unchanged. This tool saves the scene you provide as the new version.

### `excalidraw_patch_scene`

Apply strict add/update/delete changes to the current drawing version and save a new `agent_patch` version.

Inputs:

- Required: at least one change field such as `addElements`, `updateElements`, `deleteElementIds`, `appStatePatch`, `files`, or `mermaidSource`.
- Optional: `drawingId`, `addElements`, `updateElements`, `deleteElementIds`, `appStatePatch`, `files`, `mermaidSource`, `changeSummary`.
- Omit `drawingId` only when operating on the current Workbench drawing identified by rendered `excalidrawDrawingId` or middleware-injected context.
- Each `updateElements` item must include `id` plus shallow fields to merge onto the current element.

Rules:

- Unknown update ids, unknown delete ids, duplicate added ids, type changes, invalid elements, and no-op patches are rejected.
- `updateElements` is shallow. Include only fields that should change, but never change `type`.
- `deleteElementIds` deletes elements from the scene version; use it only when the user asks to remove those elements.
- `appStatePatch` shallow-merges into current appState.
- Omit `files` unless replacing the files map intentionally. If provided, it replaces the current files map.
- Patches always target the current version, not an arbitrary older version.

### `excalidraw_save_mermaid_draft`

Save Mermaid source for Workbench conversion and review.

Inputs:

- Required: `mermaidSource`.
- Required when creating a new drawing: `title`.
- Optional: `drawingId`, `description`, `kind`, `changeSummary`.
- Omit `drawingId` only when saving to the current Workbench drawing or intentionally creating a new Mermaid draft because no current drawing exists.

Rules:

- Use this when the user explicitly asks for Mermaid, provides Mermaid source, or asks for a quick draft where exact layout and editability are less important.
- Do not use this as the default path for architecture diagrams, product maps, whiteboards, UI sketches, or diagrams that should be deliberately laid out.
- Flowcharts usually convert to editable Excalidraw elements best, but direct Excalidraw elements are still preferred for new editable drawings.
- Other Mermaid diagram types may convert as image-like content and may be less editable; warn the user when editability matters.
- After the tool succeeds, the Workbench can auto-convert the Mermaid draft and save an editable Excalidraw version.

### `excalidraw_search_drawings`

Find existing drawings.

Inputs:

- Optional: `status`, `kind`, `search`, `page`, `pageSize`.
- `status` is one of `draft`, `reviewed`, `archived`.
- `pageSize` max is 100.

Rules:

- Returns drawing metadata only, not scene JSON.
- Use when the user refers to a drawing by title, topic, or status and no drawing id is available.

### `excalidraw_get_drawing`

Read compact drawing metadata, current version ref, lightweight version refs, optional action log metadata, and optional paged lightweight element refs.

Inputs:

- Required: `drawingId` unless reading the current Workbench drawing.
- Optional: `includeScene`, `versionId`, `versionNumber`, `versionLimit`, `includeLogs`, `logLimit`, `elementOffset`, `elementLimit`.
- `versionLimit` and `logLimit` max are 20.
- `elementLimit` max is 200.
- `includeFiles` is deprecated; use `excalidraw_get_scene_item` with `itemType=file`.

Rules:

- Default output is compact and intentionally avoids full scene JSON.
- Set `includeScene=true` only to page lightweight element refs for a selected version.
- Lightweight element refs include fields such as `id`, `type`, geometry, `textPreview`, file/container/frame/group refs, points count, and bound element ids.
- Use returned `currentVersion`, `requestedVersion`, `versions`, and `nextActions` to choose follow-up reads.

### `excalidraw_get_scene_item`

Fetch one explicit full scene item from a drawing version.

Inputs:

- Required: `itemType`.
- Required: `drawingId` unless reading the current Workbench drawing.
- Optional: `versionId`, `versionNumber`, `elementId`, `fileId`.
- `itemType` is one of `element`, `appState`, `file`, `mermaidSource`.

Rules:

- For `itemType=element`, provide `elementId`.
- For `itemType=file`, provide `fileId`.
- Omit `versionId` and `versionNumber` to read the current version.
- Use this before exact selected-element edits, image/file edits, binding edits, text edits, or full Mermaid inspection.

### `excalidraw_update_drawing_status`

Update a drawing lifecycle status.

Inputs:

- Required: `status`.
- Required: `drawingId` unless updating the current Workbench drawing.
- Optional: `reason`.
- `status` is one of `draft`, `reviewed`, `archived`.

Rules:

- Mark `reviewed` only after user or workflow confirmation.
- Use `archived` for Agent-side lifecycle removal. Physical drawing/version deletion is a Workbench action, not a middleware tool.

### `excalidraw_report_failure`

Record a failed generation, conversion, import, inspection, or patch attempt.

Inputs:

- Required: `operation`, `errorMessage`.
- Optional: `drawingId`, `versionId`, `recoverable`, `evidence`.

Rules:

- Call this when source material is missing, Mermaid is invalid, JSON cannot be made valid, selected elements cannot be resolved, or the requested edit conflicts with the current persisted drawing.
- Include concise evidence such as tool error text, invalid ids, parse issue, or the relevant request fragment.

## Recommended Workflows

### New editable Excalidraw drawing

Use this workflow only when there is no current Workbench drawing id or the user explicitly asked for a new/separate drawing.

1. Call `excalidraw_create_drawing` with `title`, optional `kind`, tags, and a short `changeSummary`.
2. Plan a stable coordinate system before adding elements. Leave comfortable spacing for labels and connectors.
3. Add containers, frames, or major regions first with `excalidraw_add_elements`.
4. Add nodes and text labels in small logical batches.
5. Add arrows/connectors after both endpoints exist. Keep arrow ids stable and use supported arrowhead values.
6. Use `excalidraw_get_drawing` with `includeScene=true` to page lightweight refs for verification when needed.
7. Use `excalidraw_patch_scene` for final targeted corrections.

### New Mermaid draft

1. Use this only when Mermaid is explicitly requested, Mermaid source is supplied, or speed matters more than exact editable layout.
2. Call `excalidraw_save_mermaid_draft` with `title`, `kind`, `mermaidSource`, and `changeSummary`.
3. Tell the user the draft was saved for Workbench conversion and review.
4. For follow-up edits, inspect the converted version with `excalidraw_get_drawing` and `excalidraw_get_scene_item`, then patch with direct Excalidraw elements.

### Update an existing drawing

1. Resolve the drawing id from rendered `excalidrawDrawingId`, middleware-injected current context, user input, tool results, or `excalidraw_search_drawings`.
2. Call `excalidraw_get_drawing` for compact metadata.
3. If ids or geometry are needed, call `excalidraw_get_drawing` with `includeScene=true`, `versionId` or `versionNumber`, and pagination.
4. Fetch exact items with `excalidraw_get_scene_item`.
5. Apply `excalidraw_patch_scene` for targeted edits or `excalidraw_save_scene_version` for an intentional full replacement.

### Edit the current Workbench selection

1. Parse rendered `excalidrawContextJson`.
2. Verify `currentDrawing.selection.type === "excalidraw.selection.v1"`.
3. Use rendered `excalidrawDrawingId`; use version metadata from parsed `excalidrawContextJson` only when needed.
4. For each selected id that needs exact changes, call `excalidraw_get_scene_item` with `itemType=element`.
5. Build an `excalidraw_patch_scene` request that only changes selected ids unless the user explicitly broadened scope.
6. If the scene is dirty and selected ids are not in the persisted version, ask the user to save the Workbench version or report a recoverable failure.

### Add to the current Workbench drawing with no selection

1. Read rendered `excalidrawDrawingId`.
2. Call `excalidraw_get_drawing` for compact metadata and, when placement depends on existing contents, page lightweight refs with `includeScene=true`.
3. Add new elements to that same drawing with `excalidraw_add_elements` or `excalidraw_patch_scene`.
4. If the user says "blank area" but no coordinates are available, choose a clear empty region based on the current scene bounds; do not create a new drawing.

### Inspect a large scene

1. Call `excalidraw_get_drawing` without `includeScene` first.
2. Page lightweight refs with `includeScene=true`, `elementOffset`, and `elementLimit`.
3. Fetch only the exact full elements/files/appState/Mermaid source needed with `excalidraw_get_scene_item`.
4. Avoid loading many full scene items unless the task requires it.

## Excalidraw Element Rules

- Persist only supported element types: `rectangle`, `diamond`, `ellipse`, `arrow`, `line`, `freedraw`, `text`, `image`, `frame`, `magicframe`, `iframe`, `embeddable`.
- Never persist transient `selection` elements.
- Use stable, semantic ids such as `box-api-gateway`, `text-api-gateway`, and `arrow-api-to-service`. Avoid random-looking ids unless preserving imported elements.
- Build diagrams in layers: background regions or frames, primary nodes, text labels, connectors, then annotations and highlights.
- Prefer separate text elements for labels inside important boxes when exact placement matters; use container binding only when the label should move tightly with a shape.
- Keep coordinates, widths, and heights explicit. Leave extra width for Chinese labels and multi-line text.
- Use consistent colors and stroke widths per region. Avoid making every item a separate palette unless the user's domain calls for it.
- Every element needs a non-empty `id`, explicit `type`, finite common geometry/style/version fields, `isDeleted`, `locked`, `groupIds`, and binding fields expected by Excalidraw.
- Common required string fields include `strokeColor`, `backgroundColor`, `fillStyle`, and `strokeStyle`.
- Common required number fields include `x`, `y`, `width`, `height`, `angle`, `strokeWidth`, `roughness`, `opacity`, `seed`, `version`, `versionNonce`, and `updated`.
- The service normalizes missing/invalid `updated` and invalid `index` values, but do not rely on invented order keys. Use `index: null` or omit `index` unless copying a valid order key from an existing scene.
- Text elements require fields such as `fontSize`, `fontFamily`, `text`, `originalText`, `textAlign`, `verticalAlign`, `containerId`, `autoResize`, and `lineHeight`.
- Arrow and line elements require `points`, bindings, arrowheads, and `elbowed` for arrows.
- Freedraw elements require `points`, `pressures`, `simulatePressure`, and `lastCommittedPoint`.
- Image elements require `status`, `scale`, `crop`, and a `fileId` that exists in the `files` map when non-empty.
- Keep `appStatePatch`, `files`, and `mermaidSource` omitted unless the change really needs them, so user state and assets are not overwritten accidentally.

## Response Style

Keep user-facing responses concise. State what was saved or patched, which drawing/version was affected when useful, and what the user can review next in the Workbench. If a tool failed or the selected element could not be resolved, explain the blocker and the smallest useful recovery step.
