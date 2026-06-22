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

1. Do not invent drawing ids, version ids, or element ids for existing drawings. Use Workbench context, `excalidraw_search_drawings`, `excalidraw_get_drawing`, or `excalidraw_get_scene_item`.
2. Before editing an existing drawing, call `excalidraw_get_drawing` first unless the current prompt already contains a trustworthy Workbench context with the drawing id and version ref.
3. Prefer `excalidraw_patch_scene` for targeted edits. Use `excalidraw_save_scene_version` only when a full scene replacement is intentional.
4. Use `excalidraw_get_drawing` for compact metadata and lightweight refs. Use `excalidraw_get_scene_item` for full element JSON, full appState, file payloads, or full Mermaid source.
5. Keep changes small and reviewable. For complex scenes, add elements in small batches with short `changeSummary` values.
6. Do not claim a drawing was saved unless the tool call succeeded. Tool results are the source of truth.
7. Do not route logic from display text, localized labels, sample titles, or incidental field combinations. Use explicit fields such as `selection.type`, `itemType`, `kind`, `status`, and `sourceType`.

## Workbench Selection Context

The Workbench automatically sends `assistant.context.set` when the user selects elements. That request state is not automatically visible to the model unless the assistant prompt renders it through prompt variables.

When the prompt includes these variables, use them before searching broadly:

- `env.excalidrawDrawingId`
- `env.excalidrawVersionId`
- `env.excalidrawVersionNumber`
- `env.excalidrawSelectedElementIdsJson`
- `env.excalidrawSelectionJson`
- `env.excalidrawContextJson`
- `env.excalidrawSceneDirty`

If `env.excalidrawContextJson` is non-empty, parse it as JSON. The expected shape is:

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

- Treat `currentDrawing.selection.type === "excalidraw.selection.v1"` as the only valid machine-readable selection discriminator.
- If a valid selection exists, modify only `selectedElementIds` unless the user explicitly asks to affect neighboring or unselected elements.
- Use compact `selection.elements` only for orientation, bounds, and intent. Fetch full element JSON with `excalidraw_get_scene_item` before changing exact geometry, style, bindings, text, or file-backed elements.
- If `currentDrawing.isDirty === true` or `env.excalidrawSceneDirty === "true"`, the compact selected refs may include unsaved canvas state newer than the persisted current version. Use the refs to understand the user intent, then fetch persisted JSON before patching. If the selected id is missing in the persisted version, ask the user to save the Workbench version or explain that the unsaved element cannot be patched by middleware yet.
- If no valid selection context exists but the user asks to edit "the selected element", ask them to select an element or provide a drawing id and element id.

## Tool Contracts

### `excalidraw_create_drawing`

Create a managed drawing metadata record.

Inputs:

- Required: `title`.
- Optional: `description`, `kind`, `tags`, `source`, `changeSummary`.
- `kind` is one of `diagram`, `whiteboard`, `flowchart`, `architecture`, `wireframe`, `other`.

Rules:

- This middleware schema is metadata-only. Do not pass `elements`, `appState`, `files`, or `mermaidSource`.
- After success, call `excalidraw_add_elements`, `excalidraw_save_scene_version`, or `excalidraw_save_mermaid_draft` with the returned `drawingId`.

### `excalidraw_add_elements`

Append valid full Excalidraw elements to an existing drawing.

Inputs:

- Required: `drawingId`, `elements`.
- Optional: `appStatePatch`, `files`, `mermaidSource`, `changeSummary`.
- `elements` must contain 1 to 20 full element objects.

Rules:

- Prefer 1 to 5 logically related elements per call for complex diagrams.
- This tool routes through the same strict patch path as `excalidraw_patch_scene`.
- Added element ids must be unique and must not already exist in the current scene.
- Omit `files` unless adding or replacing file-backed assets. If provided, it replaces the current files map.

### `excalidraw_save_scene_version`

Save a complete valid Excalidraw scene as a new version.

Inputs:

- Required: `drawingId`.
- Optional: `elements`, `appState`, `files`, `mermaidSource`, `sourceType`, `changeSummary`.
- `sourceType` is one of `agent_json`, `agent_patch`, `agent_mermaid`, `workbench`, `workbench_mermaid`, `import`, `restore`; Agent full JSON should normally use `agent_json`.

Rules:

- Use this only for intentional full replacement or full-scene creation after a drawing record exists.
- Read the current drawing first if user edits may exist.
- Preserve `appState`, `files`, and `mermaidSource` from the current version when they should remain unchanged. This tool saves the scene you provide as the new version.

### `excalidraw_patch_scene`

Apply strict add/update/delete changes to the current drawing version and save a new `agent_patch` version.

Inputs:

- Required: `drawingId`.
- Optional: `addElements`, `updateElements`, `deleteElementIds`, `appStatePatch`, `files`, `mermaidSource`, `changeSummary`.
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

Rules:

- Use this for flowcharts, architecture flows, state flows, dependency maps, and quick drafts.
- Flowcharts usually convert to editable Excalidraw elements best.
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

- Required: `drawingId`.
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

- Required: `drawingId`, `itemType`.
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

- Required: `drawingId`, `status`.
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

### New Mermaid-first drawing

1. Decide whether the request fits Mermaid. Use Mermaid for flows and architecture maps where exact freeform layout is less important.
2. Call `excalidraw_save_mermaid_draft` with `title`, `kind`, `mermaidSource`, and `changeSummary`.
3. Tell the user the draft was saved for Workbench conversion and review.
4. If the user later wants precise edits, inspect the converted version with `excalidraw_get_drawing` and `excalidraw_get_scene_item`, then patch.

### New precise Excalidraw drawing

1. Call `excalidraw_create_drawing` with metadata.
2. Add a small logical batch with `excalidraw_add_elements`.
3. Repeat small batches until the diagram is complete.
4. Use `excalidraw_get_drawing` with `includeScene=true` to page lightweight refs for verification when needed.
5. Use `excalidraw_patch_scene` for final targeted corrections.

### Update an existing drawing

1. Resolve the drawing id from Workbench context, user input, or `excalidraw_search_drawings`.
2. Call `excalidraw_get_drawing` for compact metadata.
3. If ids or geometry are needed, call `excalidraw_get_drawing` with `includeScene=true`, `versionId` or `versionNumber`, and pagination.
4. Fetch exact items with `excalidraw_get_scene_item`.
5. Apply `excalidraw_patch_scene` for targeted edits or `excalidraw_save_scene_version` for an intentional full replacement.

### Edit the current Workbench selection

1. Parse `env.excalidrawContextJson`.
2. Verify `currentDrawing.selection.type === "excalidraw.selection.v1"`.
3. Use `currentDrawing.drawingId` and `currentDrawing.currentVersionId` or `currentVersionNumber`.
4. For each selected id that needs exact changes, call `excalidraw_get_scene_item` with `itemType=element`.
5. Build an `excalidraw_patch_scene` request that only changes selected ids unless the user explicitly broadened scope.
6. If the scene is dirty and selected ids are not in the persisted version, ask the user to save the Workbench version or report a recoverable failure.

### Inspect a large scene

1. Call `excalidraw_get_drawing` without `includeScene` first.
2. Page lightweight refs with `includeScene=true`, `elementOffset`, and `elementLimit`.
3. Fetch only the exact full elements/files/appState/Mermaid source needed with `excalidraw_get_scene_item`.
4. Avoid loading many full scene items unless the task requires it.

## Excalidraw Element Rules

- Persist only supported element types: `rectangle`, `diamond`, `ellipse`, `arrow`, `line`, `freedraw`, `text`, `image`, `frame`, `magicframe`, `iframe`, `embeddable`.
- Never persist transient `selection` elements.
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
